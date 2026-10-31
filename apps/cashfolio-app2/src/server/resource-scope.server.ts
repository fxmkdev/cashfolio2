import { AsyncLocalStorage } from "node:async_hooks";
import { RESOURCE_LIMITS } from "../shared/resource-limits";
import { ResourceLimitError } from "./resource-error";

export type ResourceContext = {
  kind: "request" | "work";
  userId?: string;
  controller: AbortController;
  deadline?: number;
  deadlineTimer?: ReturnType<typeof setTimeout>;
  failure?: ResourceLimitError;
  closed: boolean;
  closeReason?: unknown;
  attempts: Set<symbol>;
  onAttempt?: (attempt: symbol) => void;
  memo: Map<string, Promise<unknown>>;
};
export const resourceStorage = new AsyncLocalStorage<ResourceContext>();

export function createResourceContext(
  kind: ResourceContext["kind"],
  userId?: string,
): ResourceContext {
  return {
    kind,
    userId,
    controller: new AbortController(),
    closed: false,
    attempts: new Set(),
    memo: new Map(),
  };
}

export function closeResourceContext(
  context: ResourceContext,
  reason: unknown,
) {
  if (context.closed) return;
  context.closed = true;
  context.closeReason = context.failure ?? reason;
  clearTimeout(context.deadlineTimer);
  resourceStorage.run(context, () =>
    context.controller.abort(context.closeReason),
  );
}

const deadlineError = () =>
  new ResourceLimitError(
    "This calculation took too long. Select a narrower range and try again.",
    503,
    5,
    "read_deadline",
  );
const attemptError = () =>
  new ResourceLimitError(
    "This calculation needs too many provider requests. Select a narrower range and try again.",
    429,
    1,
    "provider_request_limit",
  );

export function failResourceRequest(error: ResourceLimitError): never {
  const context = resourceStorage.getStore();
  if (context) {
    context.failure ??= error;
    context.controller.abort(context.failure);
  }
  throw error;
}

export function checkResourceBudget() {
  const context = resourceStorage.getStore();
  if (!context) return;
  if (context.failure) throw context.failure;
  if (context.closed || context.controller.signal.aborted)
    throw context.closeReason ?? context.controller.signal.reason;
  if (context.deadline !== undefined && Date.now() >= context.deadline)
    failResourceRequest(deadlineError());
}

/** Requests and detached jobs each start their own fixed cooperative deadline. */
export function startReadBudget() {
  checkResourceBudget();
  const context = resourceStorage.getStore();
  if (!context || context.deadline !== undefined) return;
  context.deadline = Date.now() + RESOURCE_LIMITS.readMs;
  context.deadlineTimer = setTimeout(() => {
    context.failure ??= deadlineError();
    context.controller.abort(context.failure);
  }, RESOURCE_LIMITS.readMs);
  context.deadlineTimer.unref();
}

/** Bind only a server-verified, active application user. Never read from inputs. */
export function bindResourceUser(userId: string) {
  checkResourceBudget();
  const context = resourceStorage.getStore();
  if (!context) return;
  if (context.userId !== undefined && context.userId !== userId)
    throw new Error("Resource user cannot change during a request.");
  context.userId = userId;
}

export function getResourceSignal() {
  return resourceStorage.getStore()?.controller.signal;
}

export function isSharedResourceWork() {
  return resourceStorage.getStore()?.kind === "work";
}

/** The same physical attempt may reach a subscriber through multiple jobs. */
export function chargeProviderAttempt(
  context: ResourceContext,
  attempt: symbol,
) {
  resourceStorage.run(context, () => {
    checkResourceBudget();
    if (context.attempts.has(attempt)) return;
    if (context.attempts.size >= RESOURCE_LIMITS.providerAttempts)
      failResourceRequest(attemptError());
    context.attempts.add(attempt);
    context.onAttempt?.(attempt);
    checkResourceBudget();
  });
}

/** Charge immediately before HTTP work, including every provider retry. */
export function consumeProviderAttempt() {
  const context = resourceStorage.getStore();
  if (context) chargeProviderAttempt(context, Symbol());
}

/** Fallback for unbound HTTP requests and separate context-free background work. */
export function createRequestScopedInFlightMap<T>() {
  const requests = new WeakMap<ResourceContext, Map<string, Promise<T>>>();
  const background = new Map<string, Promise<T>>();
  return (): Map<string, Promise<T>> => {
    checkResourceBudget();
    const context = resourceStorage.getStore();
    if (!context) return background;
    let entries = requests.get(context);
    if (!entries) {
      entries = new Map();
      requests.set(context, entries);
    }
    return entries;
  };
}

/** Keep successful probes within the owning request/job; evict rejections. */
export function reuseResourceRequestWork<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  checkResourceBudget();
  const context = resourceStorage.getStore();
  if (!context) return operation();
  const existing = context.memo.get(key);
  if (existing) return existing as Promise<T>;
  const work = operation();
  if (context.memo.size < RESOURCE_LIMITS.providerAttempts) {
    context.memo.set(key, work);
    void work.catch(() => {
      if (context.memo.get(key) === work) context.memo.delete(key);
    });
  }
  return work;
}

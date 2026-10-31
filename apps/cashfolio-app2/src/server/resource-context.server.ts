import { AsyncLocalStorage } from "node:async_hooks";
import { RESOURCE_LIMITS } from "../shared/resource-limits";
import { ResourceLimitError } from "./resource-error";
import { RESOURCE_ERROR_HEADER } from "../shared/resource-error";

type ResourceContext = {
  controller: AbortController;
  deadline?: number;
  deadlineTimer?: ReturnType<typeof setTimeout>;
  failure?: ResourceLimitError;
  closed: boolean;
  closeReason?: unknown;
  attempts: number;
  memo: Map<string, Promise<unknown>>;
};
const storage = new AsyncLocalStorage<ResourceContext>();
const deadlineError = () =>
  new ResourceLimitError(
    "This calculation took too long. Select a narrower range and try again.",
    503,
    5,
    "read_deadline",
  );

export function failResourceRequest(error: ResourceLimitError): never {
  const context = storage.getStore();
  if (context) {
    context.failure ??= error;
    context.controller.abort(context.failure);
  }
  throw error;
}

export function checkResourceBudget() {
  const context = storage.getStore();
  if (!context) return;
  if (context.failure) throw context.failure;
  if (context.closed) throw context.closeReason;
  if (context.deadline !== undefined && Date.now() >= context.deadline)
    failResourceRequest(deadlineError());
}

/** Call after authorization; internal helpers share the original deadline. */
export function startReadBudget() {
  checkResourceBudget();
  const context = storage.getStore();
  if (!context || context.deadline !== undefined) return;
  context.deadline = Date.now() + RESOURCE_LIMITS.readMs;
  context.deadlineTimer = setTimeout(() => {
    context.failure ??= deadlineError();
    context.controller.abort(context.failure);
  }, RESOURCE_LIMITS.readMs);
  context.deadlineTimer.unref();
}

export function getResourceSignal() {
  return storage.getStore()?.controller.signal;
}

/** Reuse settled provider probes within this request even without Redis. */
export function reuseResourceRequestWork<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  checkResourceBudget();
  const context = storage.getStore();
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

/** Charge immediately before starting HTTP work, including retries. */
export function consumeProviderAttempt() {
  checkResourceBudget();
  const context = storage.getStore();
  if (!context) return;
  if (context.attempts >= RESOURCE_LIMITS.providerAttempts)
    failResourceRequest(
      new ResourceLimitError(
        "This calculation needs too many provider requests. Select a narrower range and try again.",
        429,
        1,
        "provider_request_limit",
      ),
    );
  context.attempts += 1;
}

function errorResponse(error: ResourceLimitError) {
  console.warn("Resource budget rejected.", {
    status: error.status,
    category: error.code,
  });
  return new Response(error.message, {
    status: error.status,
    headers: {
      "Retry-After": String(error.retryAfter),
      [RESOURCE_ERROR_HEADER]: error.code,
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export async function withResourceRequest(
  signal: AbortSignal,
  operation: () => Promise<Response> | Response,
): Promise<Response> {
  const context: ResourceContext = {
    controller: new AbortController(),
    closed: false,
    attempts: 0,
    memo: new Map(),
  };
  return storage.run(context, async () => {
    const close = (reason: unknown = new Error("Request has finished.")) => {
      if (context.closed) return;
      context.closed = true;
      context.closeReason = context.failure ?? reason;
      clearTimeout(context.deadlineTimer);
      signal.removeEventListener("abort", cancel);
      context.controller.signal.removeEventListener("abort", closeOnAbort);
      storage.run(context, () => context.controller.abort(context.closeReason));
    };
    const closeOnAbort = () => close(context.controller.signal.reason);
    const cancel = () =>
      close(
        new ResourceLimitError(
          "The request was cancelled. Please try again.",
          503,
          5,
          "cancelled",
        ),
      );
    context.controller.signal.addEventListener("abort", closeOnAbort, {
      once: true,
    });
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    try {
      checkResourceBudget();
      const response = await operation();
      checkResourceBudget();
      if (!response.body) {
        close();
        return response;
      }
      const reader = response.body.getReader();
      return new Response(
        new ReadableStream<Uint8Array>({
          async pull(controller) {
            try {
              const chunk = await storage.run(context, () => reader.read());
              storage.run(context, checkResourceBudget);
              if (chunk.done) {
                close();
                controller.close();
              } else controller.enqueue(chunk.value);
            } catch (error) {
              close(error);
              await reader.cancel().catch(() => {});
              controller.error(error);
            }
          },
          async cancel(reason) {
            close(reason ?? new Error("Response was cancelled."));
            await reader.cancel(reason);
          },
        }),
        {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        },
      );
    } catch (error) {
      close(error);
      if (context.failure) return errorResponse(context.failure);
      if (error instanceof ResourceLimitError) return errorResponse(error);
      throw error;
    }
  });
}

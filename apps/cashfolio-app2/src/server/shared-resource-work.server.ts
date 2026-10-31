import { ResourceLimitError } from "./resource-error";
import {
  chargeProviderAttempt,
  checkResourceBudget,
  closeResourceContext,
  createRequestScopedInFlightMap,
  createResourceContext,
  resourceStorage,
  startReadBudget,
  type ResourceContext,
} from "./resource-scope.server";

type Subscriber<T> = {
  context: ResourceContext;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};
type SharedJob<T> = {
  context: ResourceContext;
  subscribers: Set<Subscriber<T>>;
};

const abandoned = () =>
  new ResourceLimitError(
    "The request was cancelled. Please try again.",
    503,
    5,
    "cancelled",
  );

function subscribe<T>(job: SharedJob<T>, parent: ResourceContext): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let detached = false;
    const detach = () => {
      if (detached) return;
      detached = true;
      parent.controller.signal.removeEventListener("abort", cancel);
      job.subscribers.delete(subscriber);
      if (!job.subscribers.size && !job.context.closed)
        closeResourceContext(job.context, abandoned());
    };
    const cancel = () => {
      detach();
      reject(parent.failure ?? parent.controller.signal.reason);
    };
    const subscriber: Subscriber<T> = {
      context: parent,
      resolve(value) {
        detach();
        resolve(value);
      },
      reject(reason) {
        detach();
        reject(reason);
      },
    };
    job.subscribers.add(subscriber);
    parent.controller.signal.addEventListener("abort", cancel, { once: true });
    try {
      for (const attempt of job.context.attempts)
        chargeProviderAttempt(parent, attempt);
      resourceStorage.run(parent, checkResourceBudget);
    } catch (error) {
      subscriber.reject(error);
    }
  });
}

function createJob<T>(
  userId: string,
  operation: () => Promise<T>,
  remove: () => void,
): SharedJob<T> {
  const context = createResourceContext("work", userId);
  const subscribers = new Set<Subscriber<T>>();
  context.onAttempt = (attempt) => {
    for (const subscriber of [...subscribers]) {
      try {
        chargeProviderAttempt(subscriber.context, attempt);
      } catch (error) {
        subscriber.reject(error);
      }
    }
  };
  resourceStorage.run(context, () => {
    let cancel!: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      cancel = () => {
        remove();
        reject(context.failure ?? context.controller.signal.reason);
      };
      context.controller.signal.addEventListener("abort", cancel, {
        once: true,
      });
    });
    startReadBudget();
    // Subscribe the initiating caller before any work can consume attempts.
    const work = Promise.resolve().then(async () => {
      checkResourceBudget();
      const value = await operation();
      checkResourceBudget();
      return value;
    });
    // One settlement handler avoids retaining cancelled callers in Promise.then
    // callbacks until a long-running job completes. Only live subscribers remain.
    void Promise.race([work, cancelled])
      .finally(() => {
        context.controller.signal.removeEventListener("abort", cancel);
        remove();
        context.onAttempt = undefined;
        closeResourceContext(context, new Error("Shared work has finished."));
      })
      .then(
        (value) => {
          for (const subscriber of [...subscribers]) subscriber.resolve(value);
        },
        (error: unknown) => {
          for (const subscriber of [...subscribers]) subscriber.reject(error);
        },
      );
  });
  return { context, subscribers };
}

/** Share only immutable-keyed work for the same verified application user. */
export function createUserScopedSharedWork<T>() {
  const users = new Map<string, Map<string, SharedJob<T>>>();
  const getLocalEntries = createRequestScopedInFlightMap<T>();
  return async (key: string, operation: () => Promise<T>): Promise<T> => {
    checkResourceBudget();
    const parent = resourceStorage.getStore();
    if (!parent?.userId) {
      const entries = getLocalEntries();
      const existing = entries.get(key);
      if (existing) return existing;
      const work = Promise.resolve().then(operation);
      entries.set(key, work);
      try {
        return await work;
      } finally {
        if (entries.get(key) === work) entries.delete(key);
      }
    }
    const userId = parent.userId;
    let entries = users.get(userId);
    if (!entries) {
      entries = new Map();
      users.set(userId, entries);
    }
    let job = entries.get(key);
    if (!job) {
      const currentEntries = entries;
      const created = createJob(userId, operation, () => {
        if (currentEntries.get(key) !== created) return;
        currentEntries.delete(key);
        if (!currentEntries.size && users.get(userId) === currentEntries)
          users.delete(userId);
      });
      entries.set(key, created);
      job = created;
    }
    if (job.context === parent)
      throw new Error("Shared work cannot subscribe to itself.");
    return subscribe(job, parent);
  };
}

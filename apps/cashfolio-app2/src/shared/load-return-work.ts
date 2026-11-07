import { ResourceLimitError } from "./resource-error";
import type {
  AccountReturnWorkResponse,
  AccountReturnProgress,
} from "./account-returns";

/** Keep one loading state across batches; do not continue superseded requests. */
export async function loadCompleteReturnWork<T>(
  request: (
    continuation: string | undefined,
    batchSize: number,
  ) => Promise<AccountReturnWorkResponse<T>>,
  signal?: AbortSignal,
  onProgress?: (progress: AccountReturnProgress | undefined) => void,
): Promise<T> {
  let continuation: string | undefined;
  let restarts = 0;
  let batchSize = 128;
  let workId: string | undefined;
  let context: string | undefined;
  let sequence = -1;
  for (let batches = 0; batches < 10_000; batches++) {
    signal?.throwIfAborted();
    let result: AccountReturnWorkResponse<T>;
    try {
      result = await request(continuation, batchSize);
    } catch (error) {
      signal?.throwIfAborted();
      if (
        !(error instanceof ResourceLimitError) ||
        !["read_deadline", "provider_request_limit"].includes(error.code) ||
        !continuation ||
        batchSize === 1
      )
        throw error;
      batchSize = Math.max(1, Math.floor(batchSize / 2));
      continue;
    }
    signal?.throwIfAborted();
    if (result.status !== "restart" && result.progress) {
      const progress = result.progress;
      if (context && context !== progress.context) onProgress?.(undefined);
      if (workId !== progress.workId || context !== progress.context) {
        sequence = -1;
        workId = progress.workId;
        context = progress.context;
      }
      if (progress.sequence >= sequence) {
        sequence = progress.sequence;
        onProgress?.(progress);
      }
    }
    if (result.status === "complete") return result.data;
    if (result.status === "restart") {
      if (++restarts > 2)
        throw new Error("Return inputs changed repeatedly. Please try again.");
      continuation = undefined;
      workId = context = undefined;
      sequence = -1;
      onProgress?.(undefined);
    } else {
      continuation = result.continuation;
      const wait = Math.min(1000, Math.max(0, result.retryAfterMs ?? 0));
      if (wait)
        await new Promise<void>((resolve, reject) => {
          const cancel = () => {
            clearTimeout(timer);
            reject(
              signal?.reason ?? new Error("Return request was cancelled."),
            );
          };
          const timer = setTimeout(() => {
            signal?.removeEventListener("abort", cancel);
            resolve();
          }, wait);
          signal?.addEventListener("abort", cancel, { once: true });
          if (signal?.aborted) cancel();
        });
    }
  }
  throw new Error(
    "Return calculation exceeded the supported workload. Please try again.",
  );
}

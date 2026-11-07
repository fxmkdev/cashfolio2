import { ResourceLimitError } from "./resource-error";
import type { AccountReturnWorkResponse } from "./account-returns";

/** Keep one loading state across batches; do not continue superseded requests. */
export async function loadCompleteReturnWork<T>(
  request: (
    continuation: string | undefined,
    batchSize: number,
  ) => Promise<AccountReturnWorkResponse<T>>,
  signal?: AbortSignal,
): Promise<T> {
  let continuation: string | undefined;
  let restarts = 0;
  let batchSize = 128;
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
    if (result.status === "complete") return result.data;
    if (result.status === "restart") {
      if (++restarts > 2)
        throw new Error("Return inputs changed repeatedly. Please try again.");
      continuation = undefined;
    } else continuation = result.continuation;
  }
  throw new Error(
    "Return calculation exceeded the supported workload. Please try again.",
  );
}

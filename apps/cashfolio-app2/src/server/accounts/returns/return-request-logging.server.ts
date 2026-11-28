import {
  logServerError,
  shouldLogServerRequestError,
} from "../../error-logging.server";
import { ResourceLimitError } from "../../resource-error";
import type { ReturnWorkArgs } from "./return-work-types";

/** Log before the RPC layer serializes errors into a response. */
export async function withLoggedReturnRequest<T>(
  operation: string,
  args: ReturnWorkArgs,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (
      !(error instanceof ResourceLimitError && error.code === "cancelled") &&
      shouldLogServerRequestError(error)
    )
      await logServerError("Account return request failed.", error, {
        operation,
        accountBookId: args.accountBookId,
        targetKind: args.target?.kind ?? "summaries",
        grouping: args.grouping,
        accountState: args.accountState,
        continuationRequest: !!args.continuation,
      });
    throw error;
  }
}

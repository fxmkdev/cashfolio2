import { createUserScopedSharedWork } from "../../resource-context.server";
import { logServerError } from "../../error-logging.server";
import { getCachedAccountReturnSummaries } from "./return-cache.server";
import {
  createReturnWorkContext,
  isReturnWorkCurrent,
  openReturnWorkSession,
} from "./return-work-context.server";
import { runReturnWorkBatch } from "./return-work-batch.server";
import {
  pendingReturnWork,
  returnWorkResponse,
  updateReturnWorkCheckpoint,
} from "./return-work-response.server";
import { returnWorkStore } from "./return-work-store.server";
import type { ReturnWorkArgs, ReturnWorkResponse } from "./return-work-types";

const shared = createUserScopedSharedWork<ReturnWorkResponse>();
async function releaseReturnWork(
  release: () => Promise<void>,
  accountBookId: string,
  workId: string,
  failed: boolean,
) {
  try {
    await release();
  } catch (error) {
    if (!failed) throw error;
    await logServerError(
      "Failed to release account return work after an error.",
      error,
      {
        accountBookId,
        workId,
      },
    );
  }
}
async function advance(
  args: ReturnWorkArgs,
  userId: string,
): Promise<ReturnWorkResponse> {
  const identity = await createReturnWorkContext(args, userId);
  const store = await returnWorkStore(args.accountBookId, userId);
  if (!args.continuation && !args.target) {
    const data = await getCachedAccountReturnSummaries(args);
    if (data) return { status: "complete", data };
  }
  const session = await openReturnWorkSession(args, identity, store);
  if (!session) return { status: "restart" };
  const { id } = session;
  const release = await store.lease(id);
  if (!release) return pendingReturnWork(args, session);
  let failed = false;
  try {
    // Reread after obtaining the lease, not before: a second tab may just have advanced it.
    const current = (await store.read(id)) ?? session.initial();
    if (current.context !== identity.context) return { status: "restart" };
    const batch = await runReturnWorkBatch(args, session, current);
    if (!batch) {
      await store.invalidate(identity.context, id);
      return { status: "restart" };
    }
    updateReturnWorkCheckpoint(current, session, batch);
    if (!(await isReturnWorkCurrent(args, identity))) {
      await store.invalidate(identity.context, id);
      return { status: "restart" };
    }
    await store.save(id, current);
    return await returnWorkResponse(args, session, current, batch);
  } catch (error) {
    failed = true;
    // A retry starts a new work envelope but reuses already completed scope artifacts.
    try {
      await store.invalidate(identity.context, id);
    } catch (cleanupError) {
      await logServerError(
        "Failed to invalidate account return work after an error.",
        cleanupError,
        {
          accountBookId: args.accountBookId,
          workId: id,
        },
      );
    }
    throw error;
  } finally {
    await releaseReturnWork(release, args.accountBookId, id, failed);
  }
}
export function queryAccountReturnWork(args: ReturnWorkArgs, userId: string) {
  const { batchSize: _batchSize, ...key } = args;
  return shared(JSON.stringify([userId, key]), () => advance(args, userId));
}

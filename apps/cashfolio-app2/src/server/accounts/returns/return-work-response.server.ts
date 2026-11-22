import type { AccountReturnSummaries } from "../../../shared/accounts/account-returns";
import { getOrLoadAccountReturnSummaries } from "./return-cache.server";
import type { ReturnWorkBatch } from "./return-work-batch.server";
import { readScopeResults, returnProgress } from "./return-work-results.server";
import type { ReturnWorkState } from "./return-work-store.server";
import type {
  ReturnWorkArgs,
  ReturnWorkResponse,
  ReturnWorkSession,
} from "./return-work-types";

export async function pendingReturnWork(
  args: ReturnWorkArgs,
  session: ReturnWorkSession,
): Promise<ReturnWorkResponse> {
  const state = (await session.store.read(session.id)) ?? session.initial();
  return {
    status: "pending",
    continuation: session.id,
    retryAfterMs: 200,
    progress: returnProgress(
      state,
      session.id,
      session.plan,
      await readScopeResults(
        args.accountBookId,
        state,
        session.plan,
        args.includeDetails ?? false,
      ),
    ),
  };
}

export function updateReturnWorkCheckpoint(
  current: ReturnWorkState,
  session: ReturnWorkSession,
  batch: ReturnWorkBatch,
) {
  current.done = [...batch.results.keys()];
  current.phase =
    batch.results.size === session.plan.scopes.length
      ? "complete"
      : batch.calculated || batch.recovered
        ? "calculation"
        : "history";
  current.validUntil = Math.min(
    Date.now() + 86400_000,
    ...[...batch.results.values()].map((r) => r.validUntil),
  );
}

export async function returnWorkResponse(
  args: ReturnWorkArgs,
  session: ReturnWorkSession,
  current: ReturnWorkState,
  batch: ReturnWorkBatch,
): Promise<ReturnWorkResponse> {
  const progress = returnProgress(
    current,
    session.id,
    session.plan,
    batch.results,
  );
  console.info("Account return batch completed.", {
    workId: session.id,
    phase: current.phase,
    sequence: current.sequence,
    completed: progress.completed,
    total: progress.total,
    elapsedMs: Date.now() - batch.started,
  });
  if (current.phase !== "complete")
    return {
      status: "pending",
      continuation: session.id,
      progress,
      retryAfterMs: batch.calculated || batch.recovered ? 0 : 200,
    };
  return completeReturnWork(args, session, current, batch, progress);
}

async function completeReturnWork(
  args: ReturnWorkArgs,
  session: ReturnWorkSession,
  current: ReturnWorkState,
  batch: ReturnWorkBatch,
  progress: ReturnType<typeof returnProgress>,
): Promise<ReturnWorkResponse> {
  if (args.target) {
    const target = session.plan.targets[0]!;
    return {
      status: "complete",
      data: { ...batch.results.get(target.key)!.data, name: target.name },
      progress,
    };
  }
  const data: AccountReturnSummaries = {
    referenceCurrency: session.plan.referenceCurrency,
    startDate: session.plan.startDate,
    asOfDate: session.identity.asOfDate,
    rows: progress.rows,
    total: progress.totalResult!,
  };
  return {
    status: "complete",
    data: await getOrLoadAccountReturnSummaries(args, async () => ({
      data,
      revision: session.identity.revision,
      cacheable: [...batch.results.values()].every((r) => !r.missing),
      expiresAt: current.validUntil,
    })),
    progress,
  };
}

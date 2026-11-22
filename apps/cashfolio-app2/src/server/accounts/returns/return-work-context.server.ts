import { getPeriodCacheGeneration } from "../../period/cache/period-cache.server";
import { createValuationLookupContext } from "../../valuation/lookup-context";
import { resolveAccountGainLossDate } from "../gain-loss/range.server";
import { loadAccountReturnInputs } from "./return-inputs.server";
import { returnArtifactId } from "./return-artifacts.server";
import { getReturnPlan } from "./return-plan.server";
import type { ReturnWorkState } from "./return-work-store.server";
import type {
  ReturnWorkArgs,
  ReturnWorkContext,
  ReturnWorkSession,
  ReturnWorkStore,
} from "./return-work-types";
const day = (date: Date) => date.toISOString().slice(0, 10);
async function readRevision(args: ReturnWorkArgs, asOfDate: string) {
  return (
    (await getPeriodCacheGeneration({ accountBookId: args.accountBookId })) ??
    (
      await loadAccountReturnInputs(
        args.accountBookId,
        new Date(`${asOfDate}T00:00:00Z`),
        args.target?.kind === "account" ? args.target.id : undefined,
      )
    ).revision
  );
}
export async function createReturnWorkContext(
  args: ReturnWorkArgs,
  userId: string,
): Promise<ReturnWorkContext> {
  const binding = JSON.stringify([
    userId,
    args.accountBookId,
    args.accountState,
    args.grouping,
    args.target ?? null,
    args.period ?? null,
    args.includeDetails ?? false,
  ]);
  const asOfDate = day(resolveAccountGainLossDate(args.period));
  const publication = day(createValuationLookupContext().latestFetchableDate);
  const revision = await readRevision(args, asOfDate);
  const context = returnArtifactId([
    "money-weighted-v5",
    binding,
    revision,
    asOfDate,
    publication,
  ]);
  return { binding, context, revision, asOfDate, publication };
}
export async function openReturnWorkSession(
  args: ReturnWorkArgs,
  identity: ReturnWorkContext,
  store: ReturnWorkStore,
): Promise<ReturnWorkSession | undefined> {
  const { binding, context, revision, asOfDate, publication } = identity;
  let id =
    args.continuation ?? (await store.indexed(context, store.createId()));
  const state = await store.read(id);
  if (
    state &&
    (state.context !== context ||
      state.binding !== binding ||
      state.createdAt + 15 * 60 * 1000 <= Date.now() ||
      (state.phase === "complete" && state.validUntil <= Date.now()))
  ) {
    if (state.binding === binding) await store.invalidate(state.context, id);
    if (args.continuation) return;
    id = await store.indexed(context, store.createId());
  } else if (args.continuation && !state) return;
  const planned = await getReturnPlan(args, revision, asOfDate, publication);
  if (!planned) return;
  const { plan } = planned;
  return {
    id,
    identity,
    plan,
    store,
    initial: () => initialWorkState(identity, planned.id),
  };
}
function initialWorkState(
  identity: ReturnWorkContext,
  planId: string,
): ReturnWorkState {
  return {
    ...identity,
    planId,
    createdAt: Date.now(),
    sequence: 0,
    done: [],
    failures: {},
    phase: "history",
    validUntil: Date.now() + 86400_000,
  };
}
export async function isReturnWorkCurrent(
  args: ReturnWorkArgs,
  identity: ReturnWorkContext,
) {
  const revision = await readRevision(args, identity.asOfDate);
  return (
    revision === identity.revision &&
    day(createValuationLookupContext().latestFetchableDate) ===
      identity.publication &&
    day(resolveAccountGainLossDate(args.period)) === identity.asOfDate
  );
}

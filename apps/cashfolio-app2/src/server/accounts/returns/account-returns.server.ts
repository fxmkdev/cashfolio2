import type {
  AccountReturnDetails,
  AccountReturnScope,
  AccountReturnSummaries,
  AccountReturnTarget,
  AccountReturnWorkResponse,
} from "../../../shared/accounts/account-returns";
import { emptyAccountReturnResult } from "../../../shared/accounts/account-returns";
import {
  checkResourceBudget,
  createUserScopedSharedWork,
} from "../../resource-context.server";
import { getPeriodCacheGeneration } from "../../period/cache/period-cache.server";
import { createValuationLookupContext } from "../../valuation/lookup-context";
import { createHistoricalLoader } from "../../valuation/history/loader.server";
import { HistoryPending } from "../../valuation/history/types";
import { resolveAccountGainLossDate } from "../gain-loss/range.server";
import { loadAccountReturnInputs } from "./return-inputs.server";
import { createReturnEngine, rateInput } from "./return-engine.server";
import { getOrLoadAccountReturnSummaries } from "./return-cache.server";
import {
  returnWorkStore,
  type ReturnWorkState,
} from "./return-work-store.server";
import { returnArtifacts, returnArtifactId } from "./return-artifacts.server";
import {
  getReturnPlan,
  readReturnBasis,
  scopeInputs,
} from "./return-plan.server";
import {
  readScopeResults,
  returnProgress,
  scopeResultId,
  type ReturnScopeResult,
} from "./return-work-results.server";
export type ReturnWorkArgs = AccountReturnScope & {
  continuation?: string;
  batchSize?: number;
  target?: AccountReturnTarget;
  period?: string;
  includeDetails?: boolean;
};
type Response = AccountReturnWorkResponse<
  AccountReturnSummaries | AccountReturnDetails
>;
const day = (date: Date) => date.toISOString().slice(0, 10);
const shared = createUserScopedSharedWork<Response>();
const CACHE_MISS = Symbol("return-cache-miss");
async function cachedSummary(scope: AccountReturnScope) {
  try {
    return await getOrLoadAccountReturnSummaries(scope, async () => {
      throw CACHE_MISS;
    });
  } catch (error) {
    if (error !== CACHE_MISS) throw error;
  }
}
async function advance(
  args: ReturnWorkArgs,
  userId: string,
): Promise<Response> {
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
  const revision =
    (await getPeriodCacheGeneration({ accountBookId: args.accountBookId })) ??
    (
      await loadAccountReturnInputs(
        args.accountBookId,
        new Date(`${asOfDate}T00:00:00Z`),
        args.target?.kind === "account" ? args.target.id : undefined,
      )
    ).revision;
  const context = returnArtifactId([binding, revision, asOfDate, publication]);
  const store = await returnWorkStore(args.accountBookId, userId);
  if (!args.continuation && !args.target) {
    const data = await cachedSummary(args);
    if (data) return { status: "complete", data };
  }
  let id =
    args.continuation ?? (await store.indexed(context, store.createId()));
  let state = await store.read(id);
  if (
    state &&
    (state.context !== context ||
      state.binding !== binding ||
      state.createdAt + 15 * 60 * 1000 <= Date.now() ||
      (state.phase === "complete" && state.validUntil <= Date.now()))
  ) {
    if (state.binding === binding) await store.invalidate(state.context, id);
    if (args.continuation) return { status: "restart" };
    id = await store.indexed(context, store.createId());
  } else if (args.continuation && !state) return { status: "restart" };
  const planned = await getReturnPlan(args, revision, asOfDate, publication);
  if (!planned) return { status: "restart" };
  const { plan } = planned;
  const initial = (): ReturnWorkState => ({
    binding,
    context,
    revision,
    asOfDate,
    publication,
    planId: planned.id,
    createdAt: Date.now(),
    sequence: 0,
    done: [],
    failures: {},
    phase: "history",
    validUntil: Date.now() + 86400_000,
  });
  const release = await store.lease(id);
  if (!release) {
    const pendingState = (await store.read(id)) ?? initial();
    return {
      status: "pending",
      continuation: id,
      retryAfterMs: 200,
      progress: returnProgress(
        pendingState,
        id,
        plan,
        await readScopeResults(
          args.accountBookId,
          pendingState,
          plan,
          args.includeDetails ?? false,
        ),
      ),
    };
  }
  try {
    // Reread after obtaining the lease, not before: a second tab may just have advanced it.
    state = (await store.read(id)) ?? initial();
    if (state.context !== context) return { status: "restart" };
    const current = state;
    const artifacts = await returnArtifacts(args.accountBookId);
    const results = await readScopeResults(
      args.accountBookId,
      current,
      plan,
      args.includeDetails ?? false,
    );
    const inputs = await readReturnBasis(args.accountBookId, plan.basisId);
    if (!inputs) {
      await store.invalidate(context, id);
      return { status: "restart" };
    }
    const missingScopes = plan.scopes.filter((s) => !results.has(s.key));
    const loader = missingScopes.some((s) => s.applicable)
      ? await createHistoricalLoader(
          missingScopes.flatMap((s) => s.requests.map(rateInput)),
          plan.referenceCurrency,
          publication,
          current.failures,
        )
      : undefined;
    const recovered = [...results.keys()].some(
      (key) => !current.done.includes(key),
    );
    let calculated = 0;
    const started = Date.now();
    const calculateReady = async () => {
      for (const scope of missingScopes) {
        if (
          results.has(scope.key) ||
          calculated >= 4 ||
          Date.now() - started >= 10_000
        )
          continue;
        checkResourceBudget();
        const target = plan.targets.find((t) => t.key === scope.key)!;
        let validUntil = Date.now() + 86400_000;
        let missing = false;
        let data: AccountReturnDetails;
        if (!scope.applicable)
          data = {
            ...emptyAccountReturnResult(false),
            name: target.name,
            referenceCurrency: plan.referenceCurrency,
            startDate: plan.startDate,
            asOfDate,
            valuations: [],
            cashFlows: [],
          };
        else {
          try {
            // Readiness checks are entirely in memory after the series range reads.
            for (const request of scope.requests) {
              const rate = await loader!.lookup(rateInput(request));
              validUntil = Math.min(
                validUntil,
                rate.validUntil,
                ["provider", "fallback", "covered"].includes(rate.source)
                  ? current.createdAt + 15 * 60 * 1000
                  : Infinity,
              );
              missing ||= rate.rate === null;
            }
            const engine = await createReturnEngine(
              scopeInputs(inputs, new Set(scope.accountIds)),
              async (input) => (await loader!.lookup(input)).rate,
            );
            data = await engine.calculate({
              ...target,
              accountIds: new Set(scope.accountIds),
            });
          } catch (error) {
            if (error instanceof HistoryPending) continue;
            throw error;
          }
        }
        if (!args.includeDetails)
          data = { ...data, valuations: [], cashFlows: [] };
        if (missing)
          validUntil = Math.min(validUntil, current.createdAt + 15 * 60 * 1000);
        const result: ReturnScopeResult = { data, validUntil, missing };
        results.set(scope.key, result);
        calculated++;
        await artifacts.save(
          scopeResultId(current, scope.key, args.includeDetails ?? false),
          result,
          validUntil,
        );
      }
    };
    await calculateReady();
    // Publish cheap scopes before waiting for providers. Their values are usable immediately.
    if (
      results.size < plan.scopes.length &&
      !calculated &&
      !recovered &&
      loader
    ) {
      await loader.pump(Math.min(4, args.batchSize ?? 128));
      await calculateReady();
    }
    if (
      results.size < plan.scopes.length &&
      !calculated &&
      !recovered &&
      loader?.pending() === 0
    )
      throw new Error(
        "Return calculation could not resolve its historical dependencies. Please try again.",
      );
    current.done = [...results.keys()];
    current.phase =
      results.size === plan.scopes.length
        ? "complete"
        : calculated || recovered
          ? "calculation"
          : "history";
    current.validUntil = Math.min(
      Date.now() + 86400_000,
      ...[...results.values()].map((r) => r.validUntil),
    );
    const committedRevision =
      (await getPeriodCacheGeneration({ accountBookId: args.accountBookId })) ??
      (
        await loadAccountReturnInputs(
          args.accountBookId,
          new Date(`${asOfDate}T00:00:00Z`),
          args.target?.kind === "account" ? args.target.id : undefined,
        )
      ).revision;
    if (
      committedRevision !== revision ||
      day(createValuationLookupContext().latestFetchableDate) !== publication ||
      day(resolveAccountGainLossDate(args.period)) !== asOfDate
    ) {
      await store.invalidate(context, id);
      return { status: "restart" };
    }
    await store.save(id, current);
    const progress = returnProgress(current, id, plan, results);
    console.info("Account return batch completed.", {
      workId: id,
      phase: current.phase,
      sequence: current.sequence,
      completed: progress.completed,
      total: progress.total,
      elapsedMs: Date.now() - started,
    });
    if (current.phase !== "complete")
      return {
        status: "pending",
        continuation: id,
        progress,
        retryAfterMs: calculated || recovered ? 0 : 200,
      };
    if (args.target) {
      const target = plan.targets[0]!;
      return {
        status: "complete",
        data: { ...results.get(target.key)!.data, name: target.name },
        progress,
      };
    }
    const data: AccountReturnSummaries = {
      referenceCurrency: plan.referenceCurrency,
      startDate: plan.startDate,
      asOfDate,
      rows: progress.rows,
      total: progress.totalResult!,
    };
    return {
      status: "complete",
      data: await getOrLoadAccountReturnSummaries(args, async () => ({
        data,
        revision,
        cacheable: [...results.values()].every((r) => !r.missing),
        expiresAt: current.validUntil,
      })),
      progress,
    };
  } catch (error) {
    // A retry starts a new work envelope but reuses already completed scope artifacts.
    await store.invalidate(context, id);
    throw error;
  } finally {
    await release();
  }
}
export function queryAccountReturnWork(args: ReturnWorkArgs, userId: string) {
  const { batchSize: _batchSize, ...key } = args;
  return shared(JSON.stringify([userId, key]), () => advance(args, userId));
}

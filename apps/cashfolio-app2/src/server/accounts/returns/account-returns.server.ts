import type {
  AccountReturnDetails,
  AccountReturnScope,
  AccountReturnSummaries,
  AccountReturnTarget,
  AccountReturnWorkResponse,
} from "../../../shared/account-returns";
import { toMoney } from "../../../shared/money";
import {
  checkResourceBudget,
  createUserScopedSharedWork,
} from "../../resource-context.server";
import { resourceStorage } from "../../resource-scope.server";
import { getPeriodCacheGeneration } from "../../period/cache/period-cache";
import { getUnitToReferenceExchangeRateDetails } from "../../period/period-conversion";
import type { DecimalValuationRateLookupResult } from "../../valuation/types";
import { createValuationLookupContext } from "../../valuation/lookup-context";
import { createAccountGainLossLookupScheduler } from "../account-gain-loss-prefetch.server";
import { resolveAccountGainLossDate } from "../account-gain-loss-range.server";
import { loadAccountReturnInputs } from "./return-inputs.server";
import {
  capitalRateRequests,
  createReturnEngine,
  rateInput,
  rateRequest,
  returnRateKey,
  returnTargets,
  stripReturnDetails,
  type ReturnInputs,
  type ReturnRateInput,
} from "./return-engine";
import { getOrLoadAccountReturnSummaries } from "./return-cache.server";
import {
  returnWorkStore,
  type ReturnWorkState,
} from "./return-work-store.server";

export type ReturnWorkArgs = AccountReturnScope & {
  continuation?: string;
  batchSize?: number;
  target?: AccountReturnTarget;
  period?: string;
  includeDetails?: boolean;
};
const day = (date: Date) => date.toISOString().slice(0, 10);
const BATCH_MS = 10_000;
const MAX_LOOKUPS = 128;
const MAX_CALCULATIONS = 4;
const shared =
  createUserScopedSharedWork<
    AccountReturnWorkResponse<AccountReturnSummaries | AccountReturnDetails>
  >();
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

/** A checkpoint contains server-generated inputs only; clients carry an opaque ID. */
async function advanceReturnWork(
  args: ReturnWorkArgs,
  userId: string,
): Promise<
  AccountReturnWorkResponse<AccountReturnSummaries | AccountReturnDetails>
> {
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
  const store = await returnWorkStore(args.accountBookId, userId);
  const id = args.continuation ?? store.createId();
  let state = args.continuation ? await store.read(id) : undefined;
  let inputs: Promise<ReturnInputs> | undefined;
  const readInputs = async () => {
    inputs ??= loadAccountReturnInputs(
      args.accountBookId,
      new Date(`${asOfDate}T00:00:00Z`),
      args.target?.kind === "account" ? args.target.id : undefined,
    );
    return inputs;
  };
  const revision =
    (await getPeriodCacheGeneration({ accountBookId: args.accountBookId })) ??
    (await readInputs()).revision;
  if (
    args.continuation &&
    (!state ||
      state.binding !== binding ||
      state.revision !== revision ||
      state.asOfDate !== asOfDate ||
      state.publication !== publication)
  ) {
    // Never delete another scope's checkpoint when a continuation is misused.
    if (state?.binding === binding) await store.remove(id);
    return { status: "restart" };
  }
  if (!state) {
    if (!args.target) {
      const cached = await cachedSummary(args);
      if (cached) return { status: "complete", data: cached };
    }
    const snapshot = await readInputs();
    returnTargets(snapshot, args, args.target); // Validate target before starting work.
    state = {
      binding,
      sequence: 0,
      revision: snapshot.revision,
      asOfDate,
      publication,
      referenceCurrency: snapshot.referenceCurrency,
      phase: "capital",
      requests: capitalRateRequests(snapshot),
      offset: 0,
      rates: {},
      results: [],
    };
    await store.save(id, state);
    return { status: "pending", continuation: id };
  }
  const current = state;
  const pending = async (): Promise<AccountReturnWorkResponse<never>> => {
    checkResourceBudget();
    await store.save(id, current);
    return { status: "pending", continuation: id };
  };
  if (current.phase !== "calculation") {
    const started = Date.now();
    const scheduleLookup = createAccountGainLossLookupScheduler();
    const exchangeRateByKey = new Map<
      string,
      Promise<DecimalValuationRateLookupResult>
    >();
    let count = 0;
    while (
      current.offset < current.requests.length &&
      count < (args.batchSize ?? MAX_LOOKUPS) &&
      Date.now() - started < BATCH_MS
    ) {
      checkResourceBudget();
      // Leave ample budget for composed FX/security lookups and backtracking.
      if ((resourceStorage.getStore()?.attempts.size ?? 0) >= 100) break;
      const requests = current.requests.slice(
        current.offset,
        current.offset + Math.min(4, (args.batchSize ?? MAX_LOOKUPS) - count),
      );
      const results = await Promise.allSettled(
        requests
          .filter(
            (request) =>
              !Object.hasOwn(current.rates, returnRateKey(rateInput(request))),
          )
          .map(async (request) => {
            const input = rateInput(request);
            const result = await getUnitToReferenceExchangeRateDetails({
              ...input,
              referenceCurrency: current.referenceCurrency,
              scheduleLookup,
              exchangeRateByKey,
            });
            current.rates[returnRateKey(input)] = {
              rate: result.rate?.toString() ?? null,
              source: result.source,
            };
          }),
      );
      // Persist successes even if a sibling lookup exhausts the request budget.
      // Retrying the same checkpoint skips these exact completed dependencies.
      const failure = results.find((r) => r.status === "rejected");
      if (failure?.status === "rejected") {
        await store.save(id, current);
        throw failure.reason;
      }
      current.offset += requests.length;
      count += requests.length;
    }
    if (current.offset < current.requests.length) return pending();
    if (current.phase === "capital") {
      const snapshot = await readInputs();
      if (snapshot.revision !== current.revision) return { status: "restart" };
      const engine = await createReturnEngine(
        snapshot,
        resolver(current, snapshot),
      );
      const requests = new Map<string, ReturnType<typeof rateRequest>>();
      for (const target of returnTargets(snapshot, args, args.target))
        await engine.calculate(
          target,
          async (input) => {
            const key = returnRateKey(input);
            if (
              !identity(input, snapshot.referenceCurrency) &&
              !Object.hasOwn(current.rates, key)
            )
              requests.set(key, rateRequest(input));
            return toMoney(1);
          },
          true,
        );
      current.phase = "valuation";
      current.requests = [...requests.values()];
      current.offset = 0;
      return pending();
    }
    current.phase = "calculation";
    current.requests = [];
    current.offset = 0;
    return pending();
  }
  const snapshot = await readInputs();
  if (snapshot.revision !== current.revision) return { status: "restart" };
  const targets = returnTargets(snapshot, args, args.target);
  const engine = await createReturnEngine(
    snapshot,
    resolver(current, snapshot),
  );
  const started = Date.now();
  let count = 0;
  while (
    current.results.length < targets.length &&
    count < MAX_CALCULATIONS &&
    Date.now() - started < BATCH_MS
  ) {
    checkResourceBudget();
    const target = targets[current.results.length]!;
    const result = await engine.calculate(target);
    current.results.push(
      args.includeDetails
        ? result
        : { ...result, valuations: [], cashFlows: [] },
    );
    count++;
  }
  if (current.results.length < targets.length) return pending();
  // Recheck after the batch: concurrent edits and publication changes cannot
  // publish or permanently cache a mixed snapshot.
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
    committedRevision !== current.revision ||
    day(createValuationLookupContext().latestFetchableDate) !== publication ||
    day(resolveAccountGainLossDate(args.period)) !== asOfDate
  )
    return { status: "restart" };
  await store.save(id, current); // Idempotent completion if the response is lost.
  if (args.target) return { status: "complete", data: current.results[0]! };
  const total = current.results.at(-1)!;
  const data: AccountReturnSummaries = {
    referenceCurrency: snapshot.referenceCurrency,
    startDate: snapshot.startDate,
    asOfDate,
    rows: targets.slice(0, -1).map((target, index) => ({
      id: target.id,
      ...stripReturnDetails(current.results[index]!),
    })),
    total: stripReturnDetails(total),
  };
  return {
    status: "complete",
    data: await getOrLoadAccountReturnSummaries(args, async () => ({
      data,
      revision: current.revision,
      cacheable: Object.values(current.rates).every(
        (r) => r.source === "identity" || r.source === "timeSeries",
      ),
    })),
  };
}

const identity = (input: ReturnRateInput, referenceCurrency: string) =>
  input.unit === "CURRENCY" &&
  input.currency?.toUpperCase() === referenceCurrency;
function resolver(state: ReturnWorkState, inputs: ReturnInputs) {
  return async (input: ReturnRateInput) => {
    if (identity(input, inputs.referenceCurrency)) return toMoney(1);
    const result = state.rates[returnRateKey(input)];
    if (!result)
      throw new Error(
        "A return valuation was not included in its lookup plan.",
      );
    return result.rate === null ? null : toMoney(result.rate);
  };
}

export function queryAccountReturnWork(args: ReturnWorkArgs, userId: string) {
  const { batchSize: _batchSize, ...key } = args;
  return shared(JSON.stringify([userId, key]), () =>
    advanceReturnWork(args, userId),
  );
}

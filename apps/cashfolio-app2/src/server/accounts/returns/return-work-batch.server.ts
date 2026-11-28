import { emptyAccountReturnResult } from "../../../shared/accounts/account-returns";
import { checkResourceBudget } from "../../resource-context.server";
import { createHistoricalLoader } from "../../valuation/history/loader.server";
import { HistoryPending } from "../../valuation/history/types";
import { returnArtifacts } from "./return-artifacts.server";
import {
  createReturnEngine,
  rateInput,
  type ReturnInputs,
} from "./return-engine.server";
import {
  readReturnBasis,
  scopeInputs,
  type ReturnScopePlan,
} from "./return-plan.server";
import {
  readScopeResults,
  scopeResultId,
  type ReturnScopeResult,
} from "./return-work-results.server";
import type { ReturnWorkState } from "./return-work-store.server";
import type { ReturnWorkArgs, ReturnWorkSession } from "./return-work-types";

export type ReturnWorkBatch = {
  results: Map<string, ReturnScopeResult>;
  calculated: number;
  recovered: boolean;
  started: number;
};
type CalculationBatch = ReturnWorkBatch & {
  session: Pick<ReturnWorkSession, "plan" | "identity">;
  current: ReturnWorkState;
  inputs: ReturnInputs;
  missingScopes: ReturnScopePlan[];
  loader: Awaited<ReturnType<typeof createHistoricalLoader>> | undefined;
  artifacts: Awaited<ReturnType<typeof returnArtifacts>>;
};

async function prepareBatch(
  args: ReturnWorkArgs,
  session: CalculationBatch["session"],
  current: ReturnWorkState,
): Promise<CalculationBatch | undefined> {
  const { plan } = session;
  const artifacts = await returnArtifacts(args.accountBookId);
  const results = await readScopeResults(
    args.accountBookId,
    current,
    plan,
    args.includeDetails ?? false,
  );
  const inputs = await readReturnBasis(args.accountBookId, plan.basisId);
  if (!inputs) return;
  const missingScopes = plan.scopes.filter((s) => !results.has(s.key));
  const loader = missingScopes.some((s) => s.applicable)
    ? await createHistoricalLoader(
        missingScopes.flatMap((s) => s.requests.map(rateInput)),
        plan.referenceCurrency,
        session.identity.publication,
        current.failures,
      )
    : undefined;
  const recovered = [...results.keys()].some(
    (key) => !current.done.includes(key),
  );
  return {
    results,
    inputs,
    missingScopes,
    loader,
    recovered,
    calculated: 0,
    started: Date.now(),
    artifacts,
    session,
    current,
  };
}

/** Both passes share one counter and timer; ready/recovered rows precede provider work. */
export async function runReturnWorkBatch(
  args: ReturnWorkArgs,
  session: CalculationBatch["session"],
  current: ReturnWorkState,
): Promise<ReturnWorkBatch | undefined> {
  const batch = await prepareBatch(args, session, current);
  if (!batch) return;
  await calculateReadyScopes(args, batch);
  if (
    batch.results.size < session.plan.scopes.length &&
    !batch.calculated &&
    !batch.recovered &&
    batch.loader
  ) {
    await batch.loader.pump(Math.min(4, args.batchSize ?? 128));
    await calculateReadyScopes(args, batch);
  }
  if (
    batch.results.size < session.plan.scopes.length &&
    !batch.calculated &&
    !batch.recovered &&
    batch.loader?.pending() === 0
  )
    throw new Error(
      "Return calculation could not resolve its historical dependencies. Please try again.",
    );
  return batch;
}

async function calculateReadyScopes(
  args: ReturnWorkArgs,
  batch: CalculationBatch,
) {
  for (const scope of batch.missingScopes) {
    if (
      batch.results.has(scope.key) ||
      batch.calculated >= 4 ||
      Date.now() - batch.started >= 10_000
    )
      continue;
    checkResourceBudget();
    let result: ReturnScopeResult;
    try {
      result = await calculateScope(args, batch, scope);
    } catch (error) {
      if (error instanceof HistoryPending) continue;
      throw error;
    }
    batch.results.set(scope.key, result);
    batch.calculated++;
    await batch.artifacts.save(
      scopeResultId(batch.current, scope.key, args.includeDetails ?? false),
      result,
      result.validUntil,
    );
  }
}

async function calculateScope(
  args: ReturnWorkArgs,
  batch: CalculationBatch,
  scope: ReturnScopePlan,
): Promise<ReturnScopeResult> {
  const { plan, identity } = batch.session;
  const target = plan.targets.find((t) => t.key === scope.key)!;
  if (!scope.applicable)
    return {
      data: {
        ...emptyAccountReturnResult(false),
        name: target.name,
        referenceCurrency: plan.referenceCurrency,
        startDate: plan.startDate,
        asOfDate: identity.asOfDate,
        valuations: [],
        cashFlows: [],
      },
      validUntil: Date.now() + 86400_000,
      missing: false,
    };
  const { validUntil, missing } = await scopeDependencies(batch, scope);
  const engine = await createReturnEngine(
    scopeInputs(batch.inputs, new Set(scope.accountIds)),
    async (input) => (await batch.loader!.lookup(input)).rate,
  );
  const data = await engine.calculate(
    { ...target, accountIds: new Set(scope.accountIds) },
    undefined,
    { includeDetails: args.includeDetails ?? false },
  );
  return {
    data,
    validUntil: missing
      ? Math.min(validUntil, batch.current.createdAt + 15 * 60 * 1000)
      : validUntil,
    missing,
  };
}

async function scopeDependencies(
  batch: CalculationBatch,
  scope: ReturnScopePlan,
) {
  let validUntil = Date.now() + 86400_000;
  let missing = false;
  // Readiness checks are entirely in memory after the series range reads.
  for (const request of scope.requests) {
    const rate = await batch.loader!.lookup(rateInput(request));
    validUntil = Math.min(
      validUntil,
      rate.validUntil,
      ["provider", "fallback", "covered"].includes(rate.source)
        ? batch.current.createdAt + 15 * 60 * 1000
        : Infinity,
    );
    missing ||= rate.rate === null;
  }
  return { validUntil, missing };
}

import type {
  AccountReturnDetails,
  AccountReturnProgress,
} from "../../../shared/accounts/account-returns";
import { isAccountReturnResult } from "./return-cache.server";
import { returnArtifactId, returnArtifacts } from "./return-artifacts.server";
import { stripReturnDetails } from "./return-engine.server";
import type { ReturnPlan } from "./return-plan.server";
import type { ReturnWorkState } from "./return-work-store.server";
export type ReturnScopeResult = {
  data: AccountReturnDetails;
  validUntil: number;
  missing: boolean;
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export const validScopeResult = (v: unknown): v is ReturnScopeResult =>
  record(v) &&
  typeof v.validUntil === "number" &&
  v.validUntil > Date.now() &&
  typeof v.missing === "boolean" &&
  record(v.data) &&
  typeof v.data.name === "string" &&
  typeof v.data.referenceCurrency === "string" &&
  typeof v.data.startDate === "string" &&
  typeof v.data.asOfDate === "string" &&
  Array.isArray(v.data.valuations) &&
  Array.isArray(v.data.cashFlows) &&
  isAccountReturnResult(v.data);
export const scopeResultId = (
  state: ReturnWorkState,
  key: string,
  includeDetails: boolean,
) =>
  returnArtifactId([
    "result-v1",
    state.revision,
    state.asOfDate,
    state.publication,
    key,
    includeDetails,
  ]);
export async function readScopeResults(
  bookId: string,
  state: ReturnWorkState,
  plan: ReturnPlan,
  includeDetails: boolean,
) {
  const artifacts = await returnArtifacts(bookId);
  const results = new Map<string, ReturnScopeResult>();
  await Promise.all(
    plan.scopes.map(async (scope) => {
      const result = await artifacts.read(
        scopeResultId(state, scope.key, includeDetails),
        validScopeResult,
      );
      if (result) results.set(scope.key, result);
    }),
  );
  return results;
}
export function returnProgress(
  state: ReturnWorkState,
  id: string,
  plan: ReturnPlan,
  results: Map<string, ReturnScopeResult>,
): AccountReturnProgress {
  const rows = [];
  let totalResult;
  for (const target of plan.targets) {
    const result = results.get(target.key);
    if (!result) continue;
    const value = stripReturnDetails(result.data);
    if (target.kind === "total") totalResult = value;
    else rows.push({ id: target.id, ...value });
  }
  return {
    context: state.context,
    workId: id,
    revision: state.revision,
    sequence: state.sequence,
    phase: state.phase,
    completed: plan.targets.filter((t) => results.has(t.key)).length,
    total: plan.targets.length,
    referenceCurrency: plan.referenceCurrency,
    startDate: plan.startDate,
    asOfDate: state.asOfDate,
    publication: state.publication,
    rows,
    totalResult,
  };
}

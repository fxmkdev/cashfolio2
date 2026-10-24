import {
  isHistoryScopedMetric,
  type HistoryScopeOption,
  type HistoryScopeSelection,
} from "@/shared/history-scope";
import { parseExplicitPeriodSelection } from "@/shared/period";
import type { HistoryMetric } from "./-page-types";

export type HistoryAccountDrillTarget = {
  kind: "ledger" | "reconciliation";
  accountId: string;
};

export function resolveHistoryAccountDrillTarget(args: {
  metric: HistoryMetric;
  scope?: HistoryScopeSelection;
  options: HistoryScopeOption[];
  gainLossEquityAccountId: string | null;
}): HistoryAccountDrillTarget | null {
  if (!isHistoryScopedMetric(args.metric)) return null;
  const option = args.options.find(
    (candidate) => candidate.value === args.scope,
  );
  if (!option) return null;

  if (args.metric !== "gainsLosses" && option.kind === "account") {
    const accountId = option.value.slice("account:".length);
    return accountId && !accountId.startsWith("virtual:")
      ? { kind: "ledger", accountId }
      : null;
  }
  if (args.metric !== "gainsLosses") return null;

  return option.accountId
    ? { kind: "reconciliation", accountId: option.accountId }
    : null;
}

export function buildHistoryAccountDrillNavigation(args: {
  accountBookId: string;
  target: HistoryAccountDrillTarget;
  periodValue: string;
}) {
  if (!parseExplicitPeriodSelection(args.periodValue)) return null;
  return {
    to:
      args.target.kind === "ledger"
        ? ("/$accountBookId/$accountId" as const)
        : ("/$accountBookId/report/gains-losses/$accountId" as const),
    params: {
      accountBookId: args.accountBookId,
      accountId: args.target.accountId,
    },
    search: { period: args.periodValue },
  };
}

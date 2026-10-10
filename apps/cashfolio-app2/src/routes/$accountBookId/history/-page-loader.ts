import {
  getPeriodHistory,
  type PeriodHistoryResponse,
} from "@/server/period-history";
import type { HistoryPeriodMode } from "./-page-types";
import type {
  HistoryScopeSelection,
  HistoryScopedMetric,
} from "@/shared/history-scope";
import type { UserLocale } from "@/user-locale";
import { getGainLossEquityAccountId } from "@/server/accounts";
import { DEFAULT_USER_LOCALE } from "@/user-locale";

export type HistoryPageLoaderData = {
  history: PeriodHistoryResponse;
  gainLossEquityAccountId: string | null;
};

export async function loadHistoryPageData(args: {
  accountBookId: string;
  mode: HistoryPeriodMode;
  scopedMetric?: HistoryScopedMetric;
  cashFlowScope: HistoryScopeSelection;
  incomeScope: HistoryScopeSelection;
  expenseScope: HistoryScopeSelection;
  gainLossScope: HistoryScopeSelection;
  assetScope: HistoryScopeSelection;
  liabilityScope: HistoryScopeSelection;
  locale?: UserLocale;
}): Promise<HistoryPageLoaderData> {
  const history = await getPeriodHistory({
    data: {
      accountBookId: args.accountBookId,
      granularity: args.mode,
      scopedMetric: args.scopedMetric,
      cashFlowScope: args.cashFlowScope,
      incomeScope: args.incomeScope,
      expenseScope: args.expenseScope,
      gainLossScope: args.gainLossScope,
      assetScope: args.assetScope,
      liabilityScope: args.liabilityScope,
      locale: args.locale ?? DEFAULT_USER_LOCALE,
    },
  });

  const gainLossEquityAccountId =
    args.scopedMetric === "gainsLosses" &&
    history.scopeSelection.gainsLosses.startsWith("explicit-account:")
      ? await getGainLossEquityAccountId({
          data: { accountBookId: args.accountBookId },
        })
      : null;

  return {
    history,
    gainLossEquityAccountId,
  };
}

import type { PeriodHistoryBatchResponse } from "@/server/period-history";
import type { HistoryLoadRequest } from "./-history-loading";
import { Temporal } from "@/shared/temporal";

export const historyRequest: HistoryLoadRequest = {
  accountBookId: "book",
  mode: "month",
  locale: "en-CH",
  cashFlowScope: "total",
  incomeScope: "total",
  expenseScope: "total",
  gainLossScope: "total",
  netWorthScope: "total",
};
export function historyBatch(
  periods: string[],
  nextBefore?: string,
  revision = "r1",
): PeriodHistoryBatchResponse {
  const total = {
    value: "total" as const,
    kind: "total" as const,
    label: "Total",
  };
  return {
    revision,
    nextBefore,
    referenceCurrency: "CHF",
    hasCashAccounts: true,
    openingBalancePoint: nextBefore
      ? null
      : {
          date: "2000-01-01",
          label: "Opening Balance",
          assets: 1,
          liabilities: 0,
          netWorth: 1,
        },
    points: periods.map((periodValue) => ({
      periodValue,
      periodLabel: periodValue,
      periodEndDate: `${Temporal.PlainYearMonth.from(periodValue.length === 4 ? `${periodValue}-12` : periodValue).toPlainDate({ day: 28 })}T00:00:00.000Z`,
      assets: 1,
      liabilities: 0,
      netWorth: 1,
      totalReturn: 1,
      savings: 1,
      cashFlow: 1,
      income: 1,
      expenses: 0,
      gainsLosses: 0,
    })),
    scopeSelection: {
      cashFlow: "total",
      income: "total",
      expenses: "total",
      gainsLosses: "total",
      netWorth: "total",
    },
    scopeOptions: {
      cashFlow: [total],
      income: [total],
      expenses: [total],
      gainsLosses: [total],
      netWorth: [total],
    },
  };
}

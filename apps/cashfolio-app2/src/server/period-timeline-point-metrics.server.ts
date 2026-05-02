import {
  getOrLoadPeriodBaseData,
  type PeriodBaseData,
} from "./period-base-data-cache";
import { loadPeriodOverview } from "./period-overview.server";

export type PeriodTimelinePointMetrics = {
  totalReturn: number;
  savings: number;
  income: number;
  expenses: number;
  gainsLosses: number;
};

export async function loadPeriodTimelinePointMetrics(args: {
  accountBookId: string;
  period?: unknown;
  baseData?: PeriodBaseData;
}) {
  const baseData =
    args.baseData ??
    (await getOrLoadPeriodBaseData({
      accountBookId: args.accountBookId,
      period: args.period,
    }));

  const overview = await loadPeriodOverview({
    accountBookId: args.accountBookId,
    period: args.period,
    baseData,
  });

  return {
    totalReturn: overview.stats.totalReturn,
    savings: overview.stats.savings,
    income: overview.stats.income,
    expenses: overview.stats.expenses,
    gainsLosses: overview.stats.gainsLosses,
  } satisfies PeriodTimelinePointMetrics;
}

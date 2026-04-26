import type { getPeriodOverview } from "@/server/period";
import { formatExactNumberWithFormatter } from "@/shared/exact-value-format";
import type { StatCardData } from "./-period-stats-cards";

type PeriodOverview = Awaited<ReturnType<typeof getPeriodOverview>>;

export type PeriodPageStatsModel = {
  statCards: StatCardData[];
  endOfPeriodStatCards: StatCardData[];
};

function getSavingsRateLabel(args: {
  income: number;
  savings: number;
  savingsRateFormatter: Intl.NumberFormat;
}): string {
  if (args.income === 0) {
    return "—";
  }

  const savingsRateRatio = args.savings / args.income;
  return args.savingsRateFormatter.format(savingsRateRatio);
}

function getGainLossLabel(amount: number): string {
  return amount >= 0 ? "Gain" : "Loss";
}

function formatExactCurrencyValue(args: {
  formatter: Intl.NumberFormat;
  value: number;
}) {
  return formatExactNumberWithFormatter({
    formatter: args.formatter,
    value: args.value,
  });
}

export function buildPeriodPageStats(args: {
  overview: PeriodOverview;
  currencyFormatter: Intl.NumberFormat;
  savingsRateFormatter: Intl.NumberFormat;
}): PeriodPageStatsModel {
  const { overview, currencyFormatter, savingsRateFormatter } = args;

  const gainsLossesLabel = getGainLossLabel(overview.stats.gainsLosses);
  const savingsRateLabel = getSavingsRateLabel({
    income: overview.stats.income,
    savings: overview.stats.savings,
    savingsRateFormatter,
  });

  const statCards: StatCardData[] = [
    {
      id: "totalReturn",
      label: "Total Return",
      value: currencyFormatter.format(overview.stats.totalReturn),
      exactValue: formatExactCurrencyValue({
        formatter: currencyFormatter,
        value: overview.statsRaw.totalReturn,
      }),
      valueColor: overview.stats.totalReturn >= 0 ? "green" : "red",
    },
    {
      id: "savings",
      label: "Savings",
      value: currencyFormatter.format(overview.stats.savings),
      exactValue: formatExactCurrencyValue({
        formatter: currencyFormatter,
        value: overview.statsRaw.savings,
      }),
      valueColor: overview.stats.savings >= 0 ? "green" : "red",
      secondaryValue: savingsRateLabel,
    },
    {
      id: "income",
      label: "Income",
      value: currencyFormatter.format(overview.stats.income),
      exactValue: formatExactCurrencyValue({
        formatter: currencyFormatter,
        value: overview.statsRaw.income,
      }),
      valueColor: "green",
    },
    {
      id: "expenses",
      label: "Expenses",
      value: currencyFormatter.format(overview.stats.expenses),
      exactValue: formatExactCurrencyValue({
        formatter: currencyFormatter,
        value: overview.statsRaw.expenses,
      }),
      valueColor: "red",
    },
    {
      id: "gainsLosses",
      label: gainsLossesLabel,
      value: currencyFormatter.format(overview.stats.gainsLosses),
      exactValue: formatExactCurrencyValue({
        formatter: currencyFormatter,
        value: overview.statsRaw.gainsLosses,
      }),
      valueColor: overview.stats.gainsLosses >= 0 ? "green" : "red",
    },
  ];

  const endOfPeriodStatCards: StatCardData[] = [
    {
      id: "endOfPeriodNetWorth",
      label: "Net Worth",
      value: currencyFormatter.format(overview.stats.endOfPeriodNetWorth),
      exactValue: formatExactCurrencyValue({
        formatter: currencyFormatter,
        value: overview.statsRaw.endOfPeriodNetWorth,
      }),
      valueColor: overview.stats.endOfPeriodNetWorth >= 0 ? "green" : "red",
    },
    {
      id: "endOfPeriodAssets",
      label: "Assets",
      value: currencyFormatter.format(overview.stats.endOfPeriodAssets),
      exactValue: formatExactCurrencyValue({
        formatter: currencyFormatter,
        value: overview.statsRaw.endOfPeriodAssets,
      }),
      valueColor: overview.stats.endOfPeriodAssets >= 0 ? "green" : "red",
    },
    {
      id: "endOfPeriodLiabilities",
      label: "Liabilities",
      value: currencyFormatter.format(overview.stats.endOfPeriodLiabilities),
      exactValue: formatExactCurrencyValue({
        formatter: currencyFormatter,
        value: overview.statsRaw.endOfPeriodLiabilities,
      }),
      valueColor: overview.stats.endOfPeriodLiabilities > 0 ? "red" : "green",
    },
  ];

  return {
    statCards,
    endOfPeriodStatCards,
  };
}

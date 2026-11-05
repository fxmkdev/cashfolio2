import type { PeriodBreakdownChartDatum } from "./-breakdown-chart-options";

export const ALLOCATION_OTHER_ID = "__allocation_other__";

export function simplifyAllocationDonut(
  data: PeriodBreakdownChartDatum[],
  currencyFormatter: Intl.NumberFormat,
  percentageFormatter: Intl.NumberFormat,
) {
  const sorted = [...data].sort((a, b) => b.amount - a.amount);
  if (sorted.length <= 5) return { chartData: sorted, otherRows: [] };

  const otherRows = sorted.slice(4);
  const amount = otherRows.reduce((sum, row) => sum + row.amount, 0);
  const percentage = otherRows.reduce((sum, row) => sum + row.percentage, 0);
  const other: PeriodBreakdownChartDatum = {
    id: ALLOCATION_OTHER_ID,
    label: "Other",
    kind: "other",
    amount,
    percentage,
    amountLabel: currencyFormatter.format(amount),
    percentageLabel: `${percentageFormatter.format(percentage)}%`,
    isDrillable: false,
  };
  return { chartData: [...sorted.slice(0, 4), other], otherRows };
}

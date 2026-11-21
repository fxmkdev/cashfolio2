import type { PriceOmission, PricePoint } from "@/shared/securities/contracts";

/** Only explicit provider omissions break the line; calendar gaps are not inferred. */
export function historyChartData(
  points: PricePoint[],
  omissions: PriceOmission[],
) {
  return [
    ...points,
    ...omissions.map(({ date }) => ({ date, close: null })),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

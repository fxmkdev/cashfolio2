export const VALUATION_UNIT_TABS = [
  "CURRENCY",
  "CRYPTOCURRENCY",
  "SECURITY",
] as const;

export type ValuationUnitTab = (typeof VALUATION_UNIT_TABS)[number];

export function isValuationUnitTab(value: unknown): value is ValuationUnitTab {
  return (
    typeof value === "string" &&
    VALUATION_UNIT_TABS.includes(value as ValuationUnitTab)
  );
}

export type ValuationUnitTab = "CURRENCY" | "CRYPTOCURRENCY" | "SECURITY";

export type ValuationCacheSearch = {
  tab?: ValuationUnitTab;
};

export const valuationUnitTabs: readonly {
  value: ValuationUnitTab;
  label: string;
}[] = [
  { value: "CURRENCY", label: "Currency" },
  { value: "CRYPTOCURRENCY", label: "Cryptocurrency" },
  { value: "SECURITY", label: "Security" },
] as const;

function isValuationUnitTab(value: unknown): value is ValuationUnitTab {
  return valuationUnitTabs.some((tab) => tab.value === value);
}

export function parseValuationCacheSearch(
  search: Record<string, unknown>,
): ValuationCacheSearch {
  return {
    tab: isValuationUnitTab(search.tab) ? search.tab : undefined,
  };
}

export function getValuationUnitTab(
  search: ValuationCacheSearch,
): ValuationUnitTab {
  return search.tab ?? "CURRENCY";
}

export function formatValuationUnitTabSearchValue(
  tab: ValuationUnitTab,
): ValuationUnitTab | undefined {
  return tab === "CURRENCY" ? undefined : tab;
}

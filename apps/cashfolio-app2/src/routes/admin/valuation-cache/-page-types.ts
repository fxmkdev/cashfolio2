import {
  VALUATION_UNIT_TABS,
  isValuationUnitTab,
  type ValuationUnitTab,
} from "../../../shared/valuation-unit-tabs";

export type { ValuationUnitTab };

export type ValuationCacheSearch = {
  tab?: ValuationUnitTab;
};

export const valuationUnitTabs: readonly {
  value: ValuationUnitTab;
  label: string;
}[] = VALUATION_UNIT_TABS.map((tab) => ({
  value: tab,
  label:
    tab === "CURRENCY"
      ? "Currency"
      : tab === "CRYPTOCURRENCY"
        ? "Cryptocurrency"
        : "Security",
}));

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

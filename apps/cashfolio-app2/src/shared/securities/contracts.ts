export type SecurityListing = {
  id: string;
  name: string;
  symbol: string;
  exchange: string | null;
  mic: string | null;
  country: string | null;
  securityType: string | null;
  currency: string | null;
  hasHistory: boolean | null;
};
export type SecuritySearchCriteria = { query: string; exchange: string | null };
export type PriceRange = "1M" | "6M" | "1Y" | "5Y";
export type PricePoint = { date: string; close: number };
export const RESULTS_PAGE_SIZE = 20;
export const SECURITY_COLUMNS = [
  "name",
  "symbol",
  "exchange",
  "country",
  "hasHistory",
] as const;
export type SecurityColumn = (typeof SECURITY_COLUMNS)[number];
export type TextFilter = {
  operation:
    | "contains"
    | "notContains"
    | "equals"
    | "notEqual"
    | "startsWith"
    | "endsWith";
  value: string;
};
export type SecuritiesFilters = {
  name?: TextFilter;
  symbol?: TextFilter;
  exchange?: string[];
  country?: string[];
  hasHistory?: string[];
};
export type SecuritiesScope = {
  version: string;
  criteria: SecuritySearchCriteria;
};
export type SecuritiesQuery = SecuritiesScope & {
  offset: number;
  limit: number;
  filters: SecuritiesFilters;
  sorts: { field: SecurityColumn; direction: "asc" | "desc" }[];
};
export type SecuritiesPage = {
  version: string;
  rows: SecurityListing[];
  filteredCount: number;
  totalCount: number;
};
export type SecuritiesFilterOptions = {
  exchange: string[];
  country: string[];
  hasHistory: string[];
};
export type SecuritiesCatalogueStatus = {
  version: string | null;
  updatedAt: string | null;
  stale: boolean;
  exchanges: { value: string; label: string }[];
};
export type SecurityHistory = {
  listing: SecurityListing;
  points: PricePoint[];
  from: string;
  through: string;
};
export function getExchangeLabel({
  exchange,
  mic,
}: Pick<SecurityListing, "exchange" | "mic">): string {
  return mic
    ? `${exchange ?? "Unknown Exchange"} (${mic})`
    : (exchange ?? "Unknown");
}
export function getHistoryLabel(available: boolean | null): string {
  return available === null
    ? "Unknown"
    : available
      ? "Available"
      : "Unavailable";
}

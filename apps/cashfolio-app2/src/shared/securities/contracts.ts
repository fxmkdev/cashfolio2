export type SecurityListing = {
  id: string;
  selectionToken: string;
  name: string;
  symbol: string;
  exchange: string | null;
  mic: string | null;
  country: string | null;
  securityType: string | null;
  currency: string | null;
  hasHistory: boolean | null;
};
export type SecuritiesPreference = { exchange: string | null };
export type SecuritySearchCriteria = { query: string; exchange: string | null };
export type PriceRange = "1M" | "6M" | "1Y" | "5Y";
export type PricePoint = { date: string; close: number };
export type PriceOmission = {
  date: string;
  reason: "missing" | "non-positive" | "invalid";
};
export type SecurityHistoryStatus =
  | { status: "ready" }
  | {
      status: "unavailable";
      reason: "no-data" | "no-usable-prices" | "invalid-data";
      message: string;
      retryAt: string;
    };
export const RESULTS_PAGE_SIZE = 20;
export type SecuritiesQuery = {
  criteria: SecuritySearchCriteria;
  offset: number;
  limit: number;
};
export type SecuritiesPage = {
  rows: SecurityListing[];
  totalCount: number;
};
export type SecuritiesExchanges = { value: string; label: string }[];
export type SecurityMetadata = { listingId: string; isin: string | null };
export type SecurityHistory = {
  listing: SecurityListing;
  points: PricePoint[];
  omissions: PriceOmission[];
  from: string;
  through: string;
} & SecurityHistoryStatus;
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

export type SecurityListing = {
  id: string;
  name: string;
  symbol: string;
  exchange: string | null;
  mic: string | null;
  country: string | null;
  securityType: string | null;
  currency: string | null;
  hasHistory: boolean;
};

export type SecuritySearchCriteria = { query: string; exchange: string | null };
export type PriceRange = "1M" | "6M" | "1Y" | "5Y";
export type PricePoint = { date: string; close: number };

export type SearchState =
  | { status: "idle" }
  | { status: "loading"; criteria: SecuritySearchCriteria }
  | { status: "error"; criteria: SecuritySearchCriteria; message: string }
  | {
      status: "ready";
      criteria: SecuritySearchCriteria;
      listings: SecurityListing[];
    };

export type HistoryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; points: PricePoint[] };

export const RESULTS_PAGE_SIZE = 20;

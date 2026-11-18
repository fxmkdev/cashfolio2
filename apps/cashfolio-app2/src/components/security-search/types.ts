import type {
  PricePoint,
  SecuritySearchCriteria,
  SecuritiesQuery,
  SecuritiesPage,
  SecuritiesFilterOptions,
  PriceOmission,
  SecurityHistoryStatus,
} from "@/shared/securities/contracts";
export { RESULTS_PAGE_SIZE } from "@/shared/securities/contracts";
export type {
  SecurityListing,
  SecuritySearchCriteria,
  PriceRange,
  PricePoint,
} from "@/shared/securities/contracts";
export type SecuritiesDataSource = {
  key: string;
  loadPage: (
    query: Pick<SecuritiesQuery, "offset" | "limit" | "filters" | "sorts">,
    signal: AbortSignal,
  ) => Promise<SecuritiesPage>;
  loadFilterOptions: (signal: AbortSignal) => Promise<SecuritiesFilterOptions>;
};
export type SearchState =
  | { status: "idle" }
  | { status: "loading"; criteria: SecuritySearchCriteria }
  | { status: "error"; criteria: SecuritySearchCriteria; message: string }
  | {
      status: "ready";
      criteria: SecuritySearchCriteria;
      source: SecuritiesDataSource;
    };

export type HistoryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | ({
      points: PricePoint[];
      omissions: PriceOmission[];
    } & SecurityHistoryStatus);

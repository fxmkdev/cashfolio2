import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createId } from "@paralleldrive/cuid2";
import { Temporal } from "@/shared/temporal";
import type {
  SecuritiesCatalogueStatus,
  SecuritiesQuery,
  SecuritiesPage,
  SecuritiesFilterOptions,
  SecuritiesScope,
  SecurityHistory,
} from "@/shared/securities/contracts";
import type {
  HistoryState,
  PriceRange,
  SearchState,
  SecurityListing,
  SecuritySearchCriteria,
} from "./types";
export type SecuritiesServices = {
  catalogue: (signal: AbortSignal) => Promise<SecuritiesCatalogueStatus>;
  search: (
    input: SecuritiesQuery,
    signal: AbortSignal,
  ) => Promise<SecuritiesPage>;
  filters: (
    input: SecuritiesScope,
    signal: AbortSignal,
  ) => Promise<SecuritiesFilterOptions>;
  history: (
    input: { version: string; id: string },
    signal: AbortSignal,
  ) => Promise<SecurityHistory>;
};
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Securities could not be loaded. Try again.";
export function useSecuritiesController(services: SecuritiesServices) {
  const [catalogue, setCatalogue] = useState<SecuritiesCatalogueStatus>({
    version: null,
    updatedAt: null,
    stale: false,
    exchanges: [],
  });
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [selectedListing, setSelectedListing] =
    useState<SecurityListing | null>(null);
  const [page, setPage] = useState(1);
  const [range, setRange] = useState<PriceRange>("1Y");
  const [historyThrough, setHistoryThrough] = useState<string | null>(null);
  const [loadedHistory, setLoadedHistory] = useState<HistoryState>({
    status: "ready",
    points: [],
  });
  const searchRequest = useRef<AbortController | null>(null);
  const historyRequest = useRef<AbortController | null>(null);
  const rows = useRef(new Map<string, SecurityListing>());
  const version = useRef<string | null>(null);
  const closeDetails = useCallback(() => {
    historyRequest.current?.abort();
    setSelectedListing(null);
  }, []);
  useEffect(() => {
    const request = new AbortController();
    searchRequest.current = request;
    void services
      .catalogue(request.signal)
      .then((status) => {
        if (request.signal.aborted) return;
        setCatalogue(status);
        if (!status.version)
          setSearch({
            status: "error",
            criteria: { query: "", exchange: null },
            message:
              "The securities catalogue is not available yet. Try again later.",
          });
      })
      .catch((error) => {
        if (!request.signal.aborted)
          setSearch({
            status: "error",
            criteria: { query: "", exchange: null },
            message: message(error),
          });
      });
    return () => {
      searchRequest.current?.abort();
      historyRequest.current?.abort();
    };
  }, [services]);
  const runSearch = useCallback(
    async (criteria: SecuritySearchCriteria) => {
      searchRequest.current?.abort();
      const request = new AbortController();
      searchRequest.current = request;
      closeDetails();
      setPage(1);
      setSearch({ status: "loading", criteria });
      rows.current.clear();
      try {
        const status = await services.catalogue(request.signal);
        if (request.signal.aborted) return;
        setCatalogue(status);
        if (!status.version)
          throw new Error(
            "The securities catalogue is not available yet. Try again later.",
          );
        version.current = status.version;
        const scope = { version: status.version, criteria };
        let options: Promise<SecuritiesFilterOptions> | undefined;
        setSearch({
          status: "ready",
          criteria,
          source: {
            key: createId(),
            async loadPage(query, signal) {
              const response = await services.search(
                { ...scope, ...query },
                AbortSignal.any([signal, request.signal]),
              );
              if (!request.signal.aborted && !signal.aborted)
                for (const row of response.rows) rows.current.set(row.id, row);
              return response;
            },
            loadFilterOptions(signal) {
              options ??= services
                .filters(scope, AbortSignal.any([signal, request.signal]))
                .catch((error) => {
                  options = undefined;
                  throw error;
                });
              return options;
            },
          },
        });
      } catch (error) {
        if (!request.signal.aborted)
          setSearch({ status: "error", criteria, message: message(error) });
      }
    },
    [services, closeDetails],
  );
  const loadHistory = useCallback(
    async (listing: SecurityListing) => {
      historyRequest.current?.abort();
      const request = new AbortController();
      historyRequest.current = request;
      setHistoryThrough(null);
      if (listing.hasHistory === false) {
        setLoadedHistory({ status: "ready", points: [] });
        return;
      }
      setLoadedHistory({ status: "loading" });
      try {
        if (!version.current)
          throw new Error("Search again to load this listing.");
        const response = await services.history(
          { version: version.current, id: listing.id },
          request.signal,
        );
        if (request.signal.aborted) return;
        setHistoryThrough(response.through);
        setSelectedListing(response.listing);
        setLoadedHistory({ status: "ready", points: response.points });
      } catch (error) {
        if (!request.signal.aborted)
          setLoadedHistory({ status: "error", message: message(error) });
      }
    },
    [services],
  );
  const history = useMemo<HistoryState>(() => {
    if (loadedHistory.status !== "ready") return loadedHistory;
    const through = historyThrough
      ? Temporal.PlainDate.from(historyThrough)
      : Temporal.Now.plainDateISO("UTC");
    const duration = {
      "1M": { months: 1 },
      "6M": { months: 6 },
      "1Y": { years: 1 },
      "5Y": { years: 5 },
    }[range];
    const from = through.subtract(duration).toString();
    return {
      status: "ready",
      points: loadedHistory.points.filter(
        (point) => point.date >= from && point.date <= through.toString(),
      ),
    };
  }, [loadedHistory, range, historyThrough]);
  return {
    search,
    exchanges: catalogue.exchanges,
    catalogueUpdatedAt: catalogue.updatedAt,
    catalogueStale: catalogue.stale,
    selectedListing,
    history,
    page,
    range,
    onSearch: (criteria: SecuritySearchCriteria) => {
      void runSearch(criteria);
    },
    onPageChange: setPage,
    onCloseDetails: closeDetails,
    onSelect: (id: string | null) => {
      if (!id) {
        closeDetails();
        return;
      }
      const listing = rows.current.get(id);
      if (!listing) return;
      setSelectedListing(listing);
      setRange("1Y");
      void loadHistory(listing);
    },
    onRangeChange: setRange,
    onRetrySearch: () => {
      if (search.status !== "idle") void runSearch(search.criteria);
    },
    onRetryHistory: () => {
      if (selectedListing) void loadHistory(selectedListing);
    },
    onCopySymbol: (symbol: string) => navigator.clipboard.writeText(symbol),
  };
}

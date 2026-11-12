import { useMemo, useState } from "react";
import { SecuritySearchView } from "../view";
import type {
  HistoryState,
  PriceRange,
  SearchState,
  SecuritySearchCriteria,
} from "../types";
import {
  createPriceHistory,
  exchangeOptions,
  listings,
  pricesForRange,
} from "./fixtures";

export type SecuritySearchHarnessProps = {
  initialSearch?: "idle" | "ready" | "loading" | "error";
  initialQuery?: string;
  initialSelectedId?: string;
  initialHistory?: HistoryState["status"];
  copySymbol?: (symbol: string) => Promise<void>;
};

function findListings(criteria: SecuritySearchCriteria) {
  const query = criteria.query.trim().toLocaleLowerCase("en-US");
  return listings.filter(
    (listing) =>
      (!criteria.exchange || listing.mic === criteria.exchange) &&
      (listing.name.toLocaleLowerCase("en-US").includes(query) ||
        listing.symbol.toLocaleLowerCase("en-US").includes(query)),
  );
}

export function SecuritySearchHarness({
  initialSearch = "idle",
  initialQuery = "",
  initialSelectedId,
  initialHistory = "ready",
  copySymbol = (symbol) => navigator.clipboard.writeText(symbol),
}: SecuritySearchHarnessProps) {
  const [search, setSearch] = useState<SearchState>(() => {
    const criteria = { query: initialQuery, exchange: null };
    if (initialSearch === "idle") return { status: "idle" };
    if (initialSearch === "ready")
      return { status: "ready", criteria, listings: findListings(criteria) };
    if (initialSearch === "error")
      return {
        status: "error",
        criteria,
        message: "The security search could not be loaded. Try again.",
      };
    return { status: "loading", criteria };
  });
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(initialSelectedId ?? null);
  const [range, setRange] = useState<PriceRange>("1Y");
  const [historyStatus, setHistoryStatus] = useState(initialHistory);
  const selectedListing =
    listings.find((listing) => listing.id === selectedId) ?? null;
  const allPrices = useMemo(
    () => (selectedListing ? createPriceHistory(selectedListing) : []),
    [selectedListing],
  );
  const history: HistoryState =
    historyStatus === "loading"
      ? { status: "loading" }
      : historyStatus === "error"
        ? {
            status: "error",
            message: "Price history could not be loaded. Try again.",
          }
        : { status: "ready", points: pricesForRange(allPrices, range) };

  function runSearch(criteria: SecuritySearchCriteria) {
    setPage(1);
    setSelectedId(null);
    setSearch({ status: "ready", criteria, listings: findListings(criteria) });
  }

  return (
    <SecuritySearchView
      search={search}
      exchanges={exchangeOptions}
      page={page}
      selectedListing={selectedListing}
      history={history}
      range={range}
      onSearch={runSearch}
      onPageChange={(nextPage) => {
        setPage(nextPage);
        setSelectedId(null);
      }}
      onSelect={(id) => {
        setSelectedId(id);
        setRange("1Y");
        setHistoryStatus("ready");
      }}
      onRangeChange={setRange}
      onRetrySearch={() => {
        if (search.status !== "idle") runSearch(search.criteria);
      }}
      onRetryHistory={() => setHistoryStatus("ready")}
      onCopySymbol={copySymbol}
    />
  );
}

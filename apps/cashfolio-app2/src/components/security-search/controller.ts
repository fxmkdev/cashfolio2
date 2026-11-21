import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createId } from "@paralleldrive/cuid2";
import type {
  SecuritiesExchanges,
  SecuritiesPreference,
  SecuritiesQuery,
  SecuritiesPage,
  SecurityHistory,
  SecurityMetadata,
  SecurityListing,
  SecuritySearchCriteria,
} from "@/shared/securities/contracts";
import {
  selectedIdentity,
  type SecurityIdentity,
  type SecuritiesRouteSearch,
} from "@/shared/securities/route-search";
import { useGlobalLoading } from "../navigation/global-loading";
import { useExchangePreference } from "./use-exchange-preference";
import {
  useSecuritySelection,
  type SelectionSource,
} from "./use-security-selection";
import type { SearchState } from "./types";
export type SecuritiesServices = {
  exchanges: (signal: AbortSignal) => Promise<SecuritiesExchanges>;
  search: (
    input: SecuritiesQuery,
    signal: AbortSignal,
  ) => Promise<SecuritiesPage>;
  resolve: (
    input: SecurityIdentity,
    signal: AbortSignal,
  ) => Promise<SecurityListing | null>;
  preference: (signal: AbortSignal) => Promise<SecuritiesPreference>;
  savePreference: (
    input: SecuritiesPreference,
    signal: AbortSignal,
  ) => Promise<SecuritiesPreference>;
  metadata: (
    input: { selectionToken: string },
    signal: AbortSignal,
  ) => Promise<SecurityMetadata>;
  history: (
    input: { selectionToken: string },
    signal: AbortSignal,
  ) => Promise<SecurityHistory>;
};
export type SecuritiesNavigation = {
  view: SecuritiesRouteSearch;
  navigate: (next: SecuritiesRouteSearch) => void;
};
export function useSecuritiesController(
  services: SecuritiesServices,
  navigation?: SecuritiesNavigation,
) {
  const [localView, setLocalView] = useState<SecuritiesRouteSearch>({});
  const view = navigation?.view ?? localView;
  const navigate = navigation?.navigate ?? setLocalView;
  const preference = useExchangePreference(services);
  const [exchanges, setExchanges] = useState<SecuritiesExchanges>([]);
  const [exchangeStatus, setExchangeStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const exchangeRequest = useRef<AbortController | null>(null);
  const loadExchanges = useCallback(() => {
    if (exchangeRequest.current || exchangeStatus === "ready") return;
    const request = new AbortController();
    exchangeRequest.current = request;
    setExchangeStatus("loading");
    void services
      .exchanges(request.signal)
      .then((options) => {
        if (!request.signal.aborted) {
          setExchanges(options);
          setExchangeStatus("ready");
        }
      })
      .catch(() => {
        if (!request.signal.aborted) setExchangeStatus("error");
      })
      .finally(() => {
        if (exchangeRequest.current === request) exchangeRequest.current = null;
      });
  }, [services, exchangeStatus]);
  useEffect(() => () => exchangeRequest.current?.abort(), [services]);
  const defaultExchange =
    view.q === undefined
      ? (preference.preference?.exchange ?? null)
      : (view.exchange ?? null);
  useEffect(() => {
    if (defaultExchange && exchangeStatus === "idle") loadExchanges();
  }, [defaultExchange, exchangeStatus, loadExchanges]);
  useGlobalLoading(exchangeStatus === "loading");
  const [refresh, setRefresh] = useState(0);
  const context = useMemo(() => {
    if (view.q === undefined) return null;
    const request = new AbortController();
    let firstDone!: () => void;
    const selection: SelectionSource = {
      key: `${createId()}:${refresh}`,
      rows: new Map(),
      firstPage: new Promise<void>((resolve) => {
        firstDone = resolve;
      }),
    };
    const criteria = { query: view.q, exchange: view.exchange ?? null };
    return {
      ...selection,
      request,
      search: {
        status: "ready",
        criteria,
        source: {
          key: selection.key,
          async loadPage(query, signal) {
            try {
              const response = await services.search(
                { criteria, ...query },
                AbortSignal.any([signal, request.signal]),
              );
              if (!request.signal.aborted && !signal.aborted)
                for (const row of response.rows)
                  selection.rows.set(row.id, row);
              return response;
            } finally {
              firstDone();
            }
          },
        },
      } satisfies SearchState,
    };
  }, [view.q, view.exchange, services, refresh]);
  useEffect(() => () => context?.request.abort(), [context]);
  const identity = useMemo(
    () =>
      selectedIdentity({
        selectedSymbol: view.selectedSymbol,
        selectedMic: view.selectedMic,
      }),
    [view.selectedSymbol, view.selectedMic],
  );
  const range = view.range ?? "1Y";
  const selection = useSecuritySelection(services, identity, context, range);
  return {
    ...preference,
    ...selection,
    controlsKey: JSON.stringify([view, refresh]),
    defaultExchange,
    preferencePending: view.q === undefined && preference.preferencePending,
    search: context?.search ?? { status: "idle" as const },
    exchanges,
    exchangeStatus,
    onLoadExchanges: loadExchanges,
    page: view.page ?? 1,
    range,
    onSearch: (criteria: SecuritySearchCriteria) => {
      // A route-changing submission commits through the router. Refreshing local
      // state first could briefly re-request the previous URL's selected listing.
      if (
        view.q === criteria.query &&
        (view.exchange ?? null) === criteria.exchange &&
        !view.page &&
        !view.selectedSymbol &&
        !view.range
      )
        setRefresh((value) => value + 1);
      navigate({
        q: criteria.query,
        ...(criteria.exchange ? { exchange: criteria.exchange } : {}),
      });
    },
    onPageChange: (page: number) =>
      navigate({ ...view, page: page > 1 ? page : undefined }),
    onCloseDetails: () =>
      navigate({
        ...view,
        selectedSymbol: undefined,
        selectedMic: undefined,
        range: undefined,
      }),
    onSelect: (id: string | null) => {
      const listing = id ? context?.rows.get(id) : null;
      if (id && !listing) return;
      navigate({
        ...view,
        selectedSymbol: listing?.symbol,
        selectedMic: listing?.mic ?? undefined,
        range: undefined,
      });
    },
    onRangeChange: (range: "1M" | "6M" | "1Y" | "5Y") =>
      navigate({ ...view, range: range === "1Y" ? undefined : range }),
    onRetrySearch: () => setRefresh((value) => value + 1),
    onCopySymbol: (symbol: string) => navigator.clipboard.writeText(symbol),
  };
}

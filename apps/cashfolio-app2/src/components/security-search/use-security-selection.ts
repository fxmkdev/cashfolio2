import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Temporal } from "@/shared/temporal";
import {
  identityKey,
  type SecurityIdentity,
} from "@/shared/securities/route-search";
import type {
  SecurityListing,
  SecurityMetadata,
  PriceRange,
} from "@/shared/securities/contracts";
import { useGlobalLoading } from "../navigation/global-loading";
import type { HistoryState } from "./types";
import type { SecuritiesServices } from "./controller";

export type SelectionSource = {
  key: string;
  rows: Map<string, SecurityListing>;
  firstPage: Promise<void>;
};
type SelectionState = {
  key: string;
  sourceKey: string;
  listing: SecurityListing | null;
  error: string | null;
  metadata: SecurityMetadata | null;
  metadataPending: boolean;
  history: HistoryState;
  through: string | null;
  quote: Pick<SecurityListing, "currency" | "securityType"> | null;
};
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The selected security could not be loaded. Try again.";
export function useSecuritySelection(
  services: SecuritiesServices,
  identity: SecurityIdentity | null,
  source: SelectionSource | null,
  range: PriceRange,
) {
  const key = identityKey(identity);
  const [state, setState] = useState<SelectionState | null>(null);
  const [retry, setRetry] = useState(0);
  const historyRequest = useRef<AbortController | null>(null);
  const selectionRequest = useRef<AbortController | null>(null);
  const sourceKey = source?.key;
  const current =
    state?.key === key && state.sourceKey === sourceKey ? state : null;
  const update = useCallback(
    (request: AbortController, change: Partial<SelectionState>) => {
      if (!request.signal.aborted)
        setState((value) =>
          value &&
          !request.signal.aborted &&
          selectionRequest.current === request
            ? { ...value, ...change }
            : value,
        );
    },
    [],
  );
  const loadHistory = useCallback(
    async (listing: SecurityListing, selection: AbortController) => {
      historyRequest.current?.abort();
      const request = new AbortController();
      historyRequest.current = request;
      const signal = AbortSignal.any([request.signal, selection.signal]);
      if (listing.hasHistory === false) return;
      update(selection, {
        history: { status: "loading" },
        quote: null,
        through: null,
      });
      try {
        const response = await services.history(
          { selectionToken: listing.selectionToken },
          signal,
        );
        if (signal.aborted) return;
        if (
          response.listing.id !== listing.id ||
          identityKey(response.listing) !== identityKey(listing)
        )
          throw new Error("Price history did not match the selected listing.");
        update(selection, {
          history: response,
          through: response.through,
          quote: {
            currency: response.listing.currency,
            securityType: response.listing.securityType,
          },
        });
      } catch (error) {
        if (!signal.aborted)
          update(selection, {
            history: { status: "error", message: errorMessage(error) },
          });
      }
    },
    [services, update],
  );
  useEffect(() => {
    if (!identity || !source) return;
    const request = new AbortController();
    selectionRequest.current = request;
    setState({
      key,
      sourceKey: source.key,
      listing: null,
      error: null,
      metadata: null,
      metadataPending: true,
      history: { status: "loading" },
      through: null,
      quote: null,
    });
    void (async () => {
      try {
        const findRow = () =>
          [...source.rows.values()].find((row) => identityKey(row) === key);
        let listing = findRow();
        if (!listing) {
          await source.firstPage;
          if (request.signal.aborted) return;
          listing = findRow();
        }
        listing ??=
          (await services.resolve(identity, request.signal)) ?? undefined;
        if (request.signal.aborted) return;
        if (!listing || identityKey(listing) !== key)
          throw new Error(
            "This listing is unavailable. Search again or select another result.",
          );
        update(request, {
          listing,
          history:
            listing.hasHistory === false
              ? { status: "ready", points: [], omissions: [] }
              : { status: "loading" },
        });
        const selected = listing;
        void services
          .metadata({ selectionToken: selected.selectionToken }, request.signal)
          .then((metadata) => {
            if (metadata.listingId === selected.id)
              update(request, { metadata });
          })
          .catch(() => {
            /* Optional metadata does not block details or history. */
          })
          .finally(() => update(request, { metadataPending: false }));
        void loadHistory(selected, request);
      } catch (error) {
        update(request, {
          error: errorMessage(error),
          metadataPending: false,
          history: { status: "error", message: errorMessage(error) },
        });
      }
    })();
    return () => {
      request.abort();
      historyRequest.current?.abort();
      setState(null);
    };
  }, [identity, key, source, services, retry, loadHistory, update]);
  const baseListing =
    current?.listing ??
    (identity && !current?.error
      ? ([...(source?.rows.values() ?? [])].find(
          (row) => identityKey(row) === key,
        ) ?? null)
      : null);
  const resolving = !!identity && !!source && !baseListing && !current?.error;
  useGlobalLoading(
    resolving ||
      !!current?.metadataPending ||
      (!!baseListing && (!current || current.history.status === "loading")),
  );
  const history = useMemo<HistoryState>(() => {
    const loaded = current?.history ?? { status: "loading" as const };
    if (loaded.status !== "ready") return loaded;
    const through = current?.through
      ? Temporal.PlainDate.from(current.through)
      : Temporal.Now.plainDateISO("UTC");
    const from = through
      .subtract(
        {
          "1M": { months: 1 },
          "6M": { months: 6 },
          "1Y": { years: 1 },
          "5Y": { years: 5 },
        }[range],
      )
      .toString();
    return {
      ...loaded,
      points: loaded.points.filter(
        (point) => point.date >= from && point.date <= through.toString(),
      ),
      omissions: loaded.omissions.filter(
        (point) => point.date >= from && point.date <= through.toString(),
      ),
    };
  }, [current, range]);
  return {
    selectedListing: baseListing
      ? {
          ...baseListing,
          currency: current?.quote?.currency ?? null,
          securityType: current?.quote?.securityType ?? null,
        }
      : null,
    metadata: current?.metadata ?? null,
    metadataPending: current?.metadataPending ?? !!baseListing,
    selectionPending: resolving,
    selectionError: current?.error ?? null,
    history,
    onRetrySelection: () => setRetry((value) => value + 1),
    onRetryHistory: () => {
      if (
        history.status === "unavailable" &&
        Temporal.Instant.compare(
          Temporal.Instant.from(history.retryAt),
          Temporal.Now.instant(),
        ) > 0
      )
        return;
      if (current?.listing && selectionRequest.current)
        void loadHistory(current.listing, selectionRequest.current);
    },
  };
}

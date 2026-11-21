import { Temporal } from "@/shared/temporal";
import type {
  SecurityHistory,
  SecurityListing,
} from "@/shared/securities/contracts";
import type { SecuritiesServices } from "../controller";
import {
  createPriceHistory,
  exchangeOptions,
  fixtureIsin,
  listings,
} from "./fixtures";
import { createFixtureSource } from "./source";

export type ControllerScenario =
  | "normal"
  | "obsolete"
  | "resultsError"
  | "pagePending"
  | "pageError"
  | "obsoleteSearch"
  | "exchangesError"
  | "historyError"
  | "partial"
  | "unusable"
  | "cooldown"
  | "metadataError"
  | "metadataLate"
  | "metadataFirst"
  | "preferencePending"
  | "preferenceLoadError"
  | "preferenceSaveError"
  | "preferenceRapid"
  | "switchPending"
  | "missingSelection";

export type ControllerFixtureRequest =
  "resolve" | "search" | "exchange" | "metadata" | "history";

type FixtureOptions = {
  scenario: ControllerScenario;
  savedExchange: string | null;
  onOffset: (offset: number) => void;
  onSavedExchange: (exchange: string | null) => void;
  onPending: (release: () => void) => void;
  onRequest: (request: ControllerFixtureRequest, count: number) => void;
};

function createPreferenceServices({
  scenario,
  savedExchange,
  onPending,
  onSavedExchange,
}: FixtureOptions): Pick<SecuritiesServices, "preference" | "savePreference"> {
  let preferenceCalls = 0;
  let saveCalls = 0;
  return {
    async preference() {
      preferenceCalls++;
      if (scenario === "preferencePending" && preferenceCalls === 1)
        await new Promise<void>(onPending);
      if (scenario === "preferenceLoadError" && preferenceCalls === 1)
        throw new Error("Read failed");
      return { exchange: savedExchange };
    },
    async savePreference(value) {
      saveCalls++;
      if (scenario === "preferenceRapid" && saveCalls === 1)
        await new Promise<void>(onPending);
      if (scenario === "preferenceSaveError" && saveCalls === 1)
        throw new Error("Write failed");
      onSavedExchange(value.exchange);
      return value;
    },
  };
}

function createDiscoveryServices({
  scenario,
  onOffset,
  onRequest,
  onPending,
}: FixtureOptions): Pick<
  SecuritiesServices,
  "resolve" | "exchanges" | "search"
> {
  let resolveCalls = 0;
  let exchangeCalls = 0;
  let pageCalls = 0;
  return {
    async resolve(identity) {
      onRequest("resolve", ++resolveCalls);
      return scenario === "missingSelection"
        ? null
        : (listings.find(
            (row) => row.symbol === identity.symbol && row.mic === identity.mic,
          ) ?? null);
    },
    async exchanges() {
      onRequest("exchange", ++exchangeCalls);
      if (scenario === "exchangesError" && exchangeCalls === 1)
        throw new Error("Temporary exchange lookup failure.");
      return exchangeOptions;
    },
    async search(query, signal) {
      onOffset(query.offset);
      onRequest("search", ++pageCalls);
      if (
        (scenario === "obsoleteSearch" && pageCalls === 1) ||
        ((scenario === "pagePending" || scenario === "resultsError") &&
          pageCalls === 2) ||
        (scenario === "pageError" && (pageCalls === 2 || pageCalls === 3))
      )
        await new Promise<void>(onPending);
      if (
        (scenario === "resultsError" && pageCalls === 1) ||
        (scenario === "pageError" && pageCalls === 2)
      )
        throw new Error("Temporary securities query failure.");
      return createFixtureSource(query.criteria).loadPage(
        query,
        scenario === "obsoleteSearch" ? new AbortController().signal : signal,
      );
    },
  };
}

function createHistoryResponse(
  listing: SecurityListing,
  scenario: ControllerScenario,
  historyCalls: number,
): SecurityHistory {
  const base = { listing, from: "2021-10-30", through: "2026-10-30" };
  if (
    scenario === "unusable" ||
    (scenario === "cooldown" && historyCalls === 1)
  )
    return {
      ...base,
      status: "unavailable",
      points: [],
      omissions: [{ date: "2026-10-30", reason: "non-positive" }],
      reason: "no-usable-prices",
      message:
        "Marketstack returned no usable closing prices for this listing.",
      retryAt: Temporal.Now.instant()
        .add({ seconds: scenario === "cooldown" ? 2 : 300 })
        .toString(),
    };
  if (scenario === "partial")
    return {
      ...base,
      status: "ready",
      points: [
        { date: "2026-09-02", close: 123.45 },
        { date: "2026-09-10", close: 124 },
        { date: "2026-09-20", close: 125 },
        { date: "2026-09-26", close: 125.67 },
      ],
      omissions: [
        { date: "2026-09-15", reason: "invalid" },
        { date: "2026-10-30", reason: "non-positive" },
      ],
    };
  return {
    ...base,
    status: "ready",
    omissions: [],
    points: createPriceHistory(listing),
  };
}

function createSelectionServices({
  scenario,
  onRequest,
  onPending,
}: FixtureOptions): Pick<SecuritiesServices, "metadata" | "history"> {
  let metadataCalls = 0;
  let historyCalls = 0;
  let switchGate: Promise<void> | null = null;
  const waitForSwitch = () => (switchGate ??= new Promise<void>(onPending));
  return {
    async metadata({ selectionToken }, signal) {
      const listing = listings.find(
        (row) => row.selectionToken === selectionToken,
      )!;
      onRequest("metadata", ++metadataCalls);
      if (scenario === "switchPending" && metadataCalls === 2)
        await waitForSwitch();
      if (scenario === "metadataError") throw new Error("Metadata unavailable");
      if (scenario === "metadataLate" && metadataCalls === 1)
        await new Promise<void>(onPending);
      if (scenario !== "metadataLate") signal.throwIfAborted();
      return { listingId: listing.id, isin: fixtureIsin(listing) };
    },
    async history({ selectionToken }, signal) {
      const listing = listings.find(
        (row) => row.selectionToken === selectionToken,
      )!;
      historyCalls++;
      if (scenario === "switchPending" && historyCalls === 2)
        await waitForSwitch();
      onRequest("history", historyCalls);
      if (scenario === "historyError" && historyCalls === 1)
        throw new Error("Temporary price lookup failure.");
      if (
        (scenario === "obsolete" || scenario === "metadataFirst") &&
        historyCalls === 1
      )
        await new Promise<void>(onPending);
      // Deliberately return even after cancellation to test the consumer guard.
      if (scenario !== "obsolete") signal.throwIfAborted();
      return createHistoryResponse(listing, scenario, historyCalls);
    },
  };
}

export function createControllerFixtureServices(
  options: FixtureOptions,
): SecuritiesServices {
  return {
    ...createPreferenceServices(options),
    ...createDiscoveryServices(options),
    ...createSelectionServices(options),
  };
}

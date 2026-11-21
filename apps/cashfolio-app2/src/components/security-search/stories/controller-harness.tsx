import { useState } from "react";
import { Temporal } from "@/shared/temporal";
import { NavigationProgress } from "@mantine/nprogress";
import type { SecuritiesRouteSearch } from "@/shared/securities/route-search";
import { Button } from "@mantine/core";
import {
  useSecuritiesController,
  type SecuritiesServices,
} from "../controller";
import { SecuritySearchView } from "../view";
import { createFixtureSource } from "./source";
import {
  createPriceHistory,
  exchangeOptions,
  listings,
  fixtureIsin,
} from "./fixtures";

export function ControllerHarness({
  scenario = "normal",
  initialView = {},
  savedExchange = null,
}: {
  initialView?: SecuritiesRouteSearch;
  savedExchange?: string | null;
  scenario?:
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
}) {
  const [entries, setEntries] = useState([initialView]);
  const [index, setIndex] = useState(0);
  const [offsets, setOffsets] = useState<number[]>([]);
  const [resolveRequests, setResolveRequests] = useState(0);
  const [saved, setSaved] = useState(savedExchange);
  const [searchRequests, setSearchRequests] = useState(0);
  const [exchangeRequests, setExchangeRequests] = useState(0);
  const [metadataRequests, setMetadataRequests] = useState(0);
  const [historyRequests, setHistoryRequests] = useState(0);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [services] = useState<SecuritiesServices>(() => {
    let preferenceCalls = 0;
    let saveCalls = 0;
    let resolveCalls = 0;
    let switchGate: Promise<void> | null = null;
    const waitForSwitch = () =>
      (switchGate ??= new Promise<void>((resolve) =>
        setPending(() => resolve),
      ));
    let exchangeCalls = 0;
    let metadataCalls = 0;
    let historyCalls = 0;
    let pageCalls = 0;
    return {
      async preference() {
        preferenceCalls++;
        if (scenario === "preferencePending" && preferenceCalls === 1)
          await new Promise<void>((resolve) => setPending(() => resolve));
        if (scenario === "preferenceLoadError" && preferenceCalls === 1)
          throw new Error("Read failed");
        return { exchange: savedExchange };
      },
      async savePreference(value) {
        saveCalls++;
        if (scenario === "preferenceRapid" && saveCalls === 1)
          await new Promise<void>((resolve) => setPending(() => resolve));
        if (scenario === "preferenceSaveError" && saveCalls === 1)
          throw new Error("Write failed");
        setSaved(value.exchange);
        return value;
      },
      async resolve(identity) {
        setResolveRequests(++resolveCalls);
        return scenario === "missingSelection"
          ? null
          : (listings.find(
              (row) =>
                row.symbol === identity.symbol && row.mic === identity.mic,
            ) ?? null);
      },
      async exchanges() {
        exchangeCalls++;
        setExchangeRequests(exchangeCalls);
        if (scenario === "exchangesError" && exchangeCalls === 1)
          throw new Error("Temporary exchange lookup failure.");
        return exchangeOptions;
      },
      async search(query, signal) {
        setOffsets((values) => [...values, query.offset]);
        pageCalls++;
        setSearchRequests(pageCalls);
        if (
          (scenario === "obsoleteSearch" && pageCalls === 1) ||
          ((scenario === "pagePending" || scenario === "resultsError") &&
            pageCalls === 2) ||
          (scenario === "pageError" && (pageCalls === 2 || pageCalls === 3))
        )
          await new Promise<void>((resolve) => setPending(() => resolve));
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
      async metadata({ selectionToken }, signal) {
        const listing = listings.find(
          (row) => row.selectionToken === selectionToken,
        )!;
        setMetadataRequests(++metadataCalls);
        if (scenario === "switchPending" && metadataCalls === 2)
          await waitForSwitch();
        if (scenario === "metadataError")
          throw new Error("Metadata unavailable");
        if (scenario === "metadataLate" && metadataCalls === 1)
          await new Promise<void>((resolve) => setPending(() => resolve));
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
        setHistoryRequests(historyCalls);
        if (scenario === "historyError" && historyCalls === 1)
          throw new Error("Temporary price lookup failure.");
        if (
          (scenario === "obsolete" || scenario === "metadataFirst") &&
          historyCalls === 1
        )
          await new Promise<void>((resolve) => setPending(() => resolve));
        // Deliberately return even after cancellation to test the consumer guard.
        if (scenario !== "obsolete") signal.throwIfAborted();
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
      },
    };
  });
  const controller = useSecuritiesController(services, {
    view: entries[index]!,
    navigate: (next) => {
      setEntries((values) => [...values.slice(0, index + 1), next]);
      setIndex(index + 1);
    },
  });
  return (
    <>
      <NavigationProgress
        withinPortal={false}
        data-testid="fixture-global-progress"
      />
      <Button disabled={index === 0} onClick={() => setIndex(index - 1)}>
        Fixture Back
      </Button>
      <Button
        disabled={index === entries.length - 1}
        onClick={() => setIndex(index + 1)}
      >
        Fixture Forward
      </Button>
      <output aria-label="Fixture URL" hidden>
        {JSON.stringify(entries[index])}
      </output>
      <output aria-label="Fixture Offsets" hidden>
        {JSON.stringify(offsets)}
      </output>
      <output aria-label="Fixture Resolve Requests" hidden>
        {resolveRequests}
      </output>
      <output aria-label="Fixture Saved Exchange" hidden>
        {saved ?? "All"}
      </output>
      <output aria-label="Fixture Search Requests" hidden>
        {searchRequests}
      </output>
      <output aria-label="Fixture Exchange Requests" hidden>
        {exchangeRequests}
      </output>
      <output aria-label="Fixture Metadata Requests" hidden>
        {metadataRequests}
      </output>
      <output aria-label="Fixture History Requests" hidden>
        {historyRequests}
      </output>
      {pending && (
        <Button
          onClick={() => {
            pending();
            setPending(null);
          }}
        >
          Release Previous Response
        </Button>
      )}
      <SecuritySearchView {...controller} />
    </>
  );
}

import { Button } from "@mantine/core";
import { NavigationProgress } from "@mantine/nprogress";
import { useState } from "react";
import type { SecuritiesRouteSearch } from "@/shared/securities/route-search";
import {
  createControllerFixtureServices,
  type ControllerFixtureRequest,
  type ControllerScenario,
} from "./controller-fixture-services";

export function useControllerFixture(
  scenario: ControllerScenario,
  savedExchange: string | null,
) {
  const [offsets, setOffsets] = useState<number[]>([]);
  const [saved, setSaved] = useState(savedExchange);
  const [requests, setRequests] = useState<
    Record<ControllerFixtureRequest, number>
  >({ resolve: 0, search: 0, exchange: 0, metadata: 0, history: 0 });
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [services] = useState(() =>
    createControllerFixtureServices({
      scenario,
      savedExchange,
      onOffset: (offset) => setOffsets((values) => [...values, offset]),
      onSavedExchange: setSaved,
      onPending: (release) => setPending(() => release),
      onRequest: (request, count) =>
        setRequests((values) => ({ ...values, [request]: count })),
    }),
  );
  return {
    services,
    offsets,
    saved,
    requests,
    pending,
    releasePending: () => {
      pending?.();
      setPending(null);
    },
  };
}

type FixtureControlsProps = {
  fixture: ReturnType<typeof useControllerFixture>;
  view: SecuritiesRouteSearch;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
};

export function ControllerFixtureControls({
  fixture,
  view,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
}: FixtureControlsProps) {
  const outputs = [
    ["Fixture URL", JSON.stringify(view)],
    ["Fixture Offsets", JSON.stringify(fixture.offsets)],
    ["Fixture Resolve Requests", fixture.requests.resolve],
    ["Fixture Saved Exchange", fixture.saved ?? "All"],
    ["Fixture Search Requests", fixture.requests.search],
    ["Fixture Exchange Requests", fixture.requests.exchange],
    ["Fixture Metadata Requests", fixture.requests.metadata],
    ["Fixture History Requests", fixture.requests.history],
  ] as const;
  return (
    <>
      <NavigationProgress
        withinPortal={false}
        data-testid="fixture-global-progress"
      />
      <Button disabled={!canGoBack} onClick={onBack}>
        Fixture Back
      </Button>
      <Button disabled={!canGoForward} onClick={onForward}>
        Fixture Forward
      </Button>
      {outputs.map(([label, value]) => (
        <output key={label} aria-label={label} hidden>
          {value}
        </output>
      ))}
      {fixture.pending && (
        <Button onClick={fixture.releasePending}>
          Release Previous Response
        </Button>
      )}
    </>
  );
}

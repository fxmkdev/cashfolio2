import { useState } from "react";
import type { SecuritiesRouteSearch } from "@/shared/securities/route-search";
import { useSecuritiesController } from "../controller";
import { SecuritySearchView } from "../view";
import {
  ControllerFixtureControls,
  useControllerFixture,
} from "./controller-fixture";
import type { ControllerScenario } from "./controller-fixture-services";

type ControllerHarnessProps = {
  initialView?: SecuritiesRouteSearch;
  savedExchange?: string | null;
  scenario?: ControllerScenario;
};

export function ControllerHarness({
  scenario = "normal",
  initialView = {},
  savedExchange = null,
}: ControllerHarnessProps) {
  const [entries, setEntries] = useState([initialView]);
  const [index, setIndex] = useState(0);
  const fixture = useControllerFixture(scenario, savedExchange);
  const controller = useSecuritiesController(fixture.services, {
    view: entries[index]!,
    navigate: (next) => {
      setEntries((values) => [...values.slice(0, index + 1), next]);
      setIndex(index + 1);
    },
  });
  return (
    <>
      <ControllerFixtureControls
        fixture={fixture}
        view={entries[index]!}
        canGoBack={index > 0}
        canGoForward={index < entries.length - 1}
        onBack={() => setIndex(index - 1)}
        onForward={() => setIndex(index + 1)}
      />
      <SecuritySearchView {...controller} />
    </>
  );
}

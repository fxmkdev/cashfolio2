import { useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { tabs, type TabValue, type AccountsMode } from "../-page-types";
import type { AccountsStoryOptions } from "./types";

export function useStoryRouting({
  initialTab = "BALANCE",
  initialMode,
}: AccountsStoryOptions) {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const routeSearch = useRouterState({
    select: (state) => state.location.search,
  });
  const [tabState] = useState<TabValue>(initialTab);
  const [modeState, setModeState] = useState<AccountsMode>(initialMode);
  const tab: TabValue =
    typeof routeSearch.tab === "string" &&
    tabs.some((candidate) => candidate.value === routeSearch.tab)
      ? (routeSearch.tab as TabValue)
      : tabState;
  const mode: AccountsMode =
    routeSearch.mode === "archived" ? "archived" : modeState;
  return {
    navigate,
    pathname,
    routeSearch,
    tab,
    mode,
    setModeState,
    showArchived: routeSearch.showArchived === true,
    isEquityTab: tab.startsWith("EQUITY-"),
  };
}

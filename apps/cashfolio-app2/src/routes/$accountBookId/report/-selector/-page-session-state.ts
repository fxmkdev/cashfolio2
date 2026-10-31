import { useCallback, useEffect, useState } from "react";
import {
  isReportingGrouping,
  type ReportingGrouping,
} from "@/shared/reporting-grouping";
import type {
  AllocationBreakdownType,
  BreakdownChartType,
  BreakdownType,
  GainsLossesChartType,
} from "../-breakdown/-breakdown-types";

export type DrillPathByBreakdown = Record<BreakdownType, string[]>;
export type DrillPathByAllocationBreakdown = Record<
  AllocationBreakdownType,
  string[]
>;
export type DrillPathByBreakdownUpdater =
  | DrillPathByBreakdown
  | ((previousValue: DrillPathByBreakdown) => DrillPathByBreakdown);
export type DrillPathByAllocationBreakdownUpdater =
  | DrillPathByAllocationBreakdown
  | ((
      previousValue: DrillPathByAllocationBreakdown,
    ) => DrillPathByAllocationBreakdown);
export type DrillPathByGainsLossesUpdater =
  string[] | ((previousValue: string[]) => string[]);

export type GroupingDrillPaths = {
  allocation: DrillPathByAllocationBreakdown;
  gainsLosses: string[];
};

export type ReportPageSessionState = {
  selectedGrouping: ReportingGrouping;
  drillPathsByGrouping: Record<ReportingGrouping, GroupingDrillPaths>;
  selectedBreakdown: BreakdownType;
  selectedChartType: BreakdownChartType;
  selectedAllocationBreakdown: AllocationBreakdownType;
  selectedAllocationChartType: BreakdownChartType;
  selectedGainsLossesChartType: GainsLossesChartType;
  drillPathByBreakdown: DrillPathByBreakdown;
};

function isBreakdownType(value: unknown): value is BreakdownType {
  return value === "expense" || value === "income" || value === "cashFlow";
}

function isAllocationBreakdownType(
  value: unknown,
): value is AllocationBreakdownType {
  return value === "asset" || value === "liability";
}

function isBreakdownChartType(value: unknown): value is BreakdownChartType {
  return value === "donut" || value === "bar" || value === "table";
}

function isGainsLossesChartType(value: unknown): value is GainsLossesChartType {
  return value === "waterfall" || value === "table";
}

function normalizeDrillPath(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((segment) => (typeof segment === "string" ? segment.trim() : ""))
    .filter((segment) => segment.length > 0);
}

export function getDefaultReportPageSessionState(): ReportPageSessionState {
  return {
    selectedGrouping: "accountStructure",
    drillPathsByGrouping: {
      accountStructure: {
        allocation: { asset: [], liability: [] },
        gainsLosses: [],
      },
      assetClass: { allocation: { asset: [], liability: [] }, gainsLosses: [] },
    },
    selectedBreakdown: "expense",
    selectedChartType: "donut",
    selectedAllocationBreakdown: "asset",
    selectedAllocationChartType: "donut",
    selectedGainsLossesChartType: "waterfall",
    drillPathByBreakdown: {
      expense: [],
      income: [],
      cashFlow: [],
    },
  };
}

export function parseStoredReportPageSessionState(
  rawValue: unknown,
): ReportPageSessionState {
  const defaults = getDefaultReportPageSessionState();

  if (typeof rawValue !== "object" || rawValue == null) {
    return defaults;
  }

  const stored = rawValue as Record<string, unknown>;
  const drillPathByBreakdown =
    typeof stored.drillPathByBreakdown === "object" &&
    stored.drillPathByBreakdown != null
      ? (stored.drillPathByBreakdown as Record<string, unknown>)
      : {};
  const drillPathByAllocationBreakdown =
    typeof stored.drillPathByAllocationBreakdown === "object" &&
    stored.drillPathByAllocationBreakdown != null
      ? (stored.drillPathByAllocationBreakdown as Record<string, unknown>)
      : {};

  const record = (value: unknown): Record<string, unknown> =>
    typeof value === "object" && value != null
      ? (value as Record<string, unknown>)
      : {};
  const grouped = record(stored.drillPathsByGrouping);
  const parseGrouping = (grouping: ReportingGrouping): GroupingDrillPaths => {
    const group = record(grouped[grouping]);
    const allocation = record(group.allocation);
    const legacyAllocation =
      grouping === "accountStructure" ? drillPathByAllocationBreakdown : {};
    return {
      allocation: {
        asset: normalizeDrillPath(allocation.asset ?? legacyAllocation.asset),
        liability: normalizeDrillPath(
          allocation.liability ?? legacyAllocation.liability,
        ),
      },
      gainsLosses: normalizeDrillPath(
        group.gainsLosses ??
          (grouping === "assetClass" ? stored.drillPathByGainsLosses : []),
      ),
    };
  };
  return {
    selectedGrouping: isReportingGrouping(stored.selectedGrouping)
      ? stored.selectedGrouping
      : defaults.selectedGrouping,
    drillPathsByGrouping: {
      accountStructure: parseGrouping("accountStructure"),
      assetClass: parseGrouping("assetClass"),
    },
    selectedBreakdown: isBreakdownType(stored.selectedBreakdown)
      ? stored.selectedBreakdown
      : defaults.selectedBreakdown,
    selectedChartType: isBreakdownChartType(stored.selectedChartType)
      ? stored.selectedChartType
      : defaults.selectedChartType,
    selectedAllocationBreakdown: isAllocationBreakdownType(
      stored.selectedAllocationBreakdown,
    )
      ? stored.selectedAllocationBreakdown
      : defaults.selectedAllocationBreakdown,
    selectedAllocationChartType: isBreakdownChartType(
      stored.selectedAllocationChartType,
    )
      ? stored.selectedAllocationChartType
      : defaults.selectedAllocationChartType,
    selectedGainsLossesChartType: isGainsLossesChartType(
      stored.selectedGainsLossesChartType,
    )
      ? stored.selectedGainsLossesChartType
      : defaults.selectedGainsLossesChartType,
    drillPathByBreakdown: {
      expense: normalizeDrillPath(drillPathByBreakdown.expense),
      income: normalizeDrillPath(drillPathByBreakdown.income),
      cashFlow: normalizeDrillPath(drillPathByBreakdown.cashFlow),
    },
  };
}

function loadReportPageSessionState(
  storageKey: string,
): ReportPageSessionState {
  const defaults = getDefaultReportPageSessionState();

  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored == null) {
      return defaults;
    }

    return parseStoredReportPageSessionState(JSON.parse(stored));
  } catch {
    return defaults;
  }
}

export function useReportPageSessionState(accountBookId: string) {
  const storageKey = `cashfolio:reportPageState:${accountBookId}`;
  const [state, setState] = useState<ReportPageSessionState>(
    getDefaultReportPageSessionState,
  );
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(false);
    setState(getDefaultReportPageSessionState());

    if (typeof window === "undefined") {
      return;
    }

    setState(loadReportPageSessionState(storageKey));
    setIsHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") {
      return;
    }

    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Ignore storage persistence failures so the page still functions.
    }
  }, [isHydrated, state, storageKey]);

  const setSelectedBreakdown = useCallback((nextValue: BreakdownType) => {
    setState((previousState) => ({
      ...previousState,
      selectedBreakdown: nextValue,
    }));
  }, []);

  const setSelectedChartType = useCallback((nextValue: BreakdownChartType) => {
    setState((previousState) => ({
      ...previousState,
      selectedChartType: nextValue,
    }));
  }, []);

  const setSelectedAllocationBreakdown = useCallback(
    (nextValue: AllocationBreakdownType) => {
      setState((previousState) => ({
        ...previousState,
        selectedAllocationBreakdown: nextValue,
      }));
    },
    [],
  );

  const setSelectedAllocationChartType = useCallback(
    (nextValue: BreakdownChartType) => {
      setState((previousState) => ({
        ...previousState,
        selectedAllocationChartType: nextValue,
      }));
    },
    [],
  );
  const setSelectedGainsLossesChartType = useCallback(
    (nextValue: GainsLossesChartType) => {
      setState((previousState) => ({
        ...previousState,
        selectedGainsLossesChartType: nextValue,
      }));
    },
    [],
  );

  const setDrillPathByBreakdown = useCallback(
    (nextValue: DrillPathByBreakdownUpdater) => {
      setState((previousState) => ({
        ...previousState,
        drillPathByBreakdown: (() => {
          const resolvedValue =
            typeof nextValue === "function"
              ? nextValue(previousState.drillPathByBreakdown)
              : nextValue;

          return {
            expense: normalizeDrillPath(resolvedValue.expense),
            income: normalizeDrillPath(resolvedValue.income),
            cashFlow: normalizeDrillPath(resolvedValue.cashFlow),
          };
        })(),
      }));
    },
    [],
  );

  const setSelectedGrouping = useCallback(
    (selectedGrouping: ReportingGrouping) => {
      setState((previous) => ({ ...previous, selectedGrouping }));
    },
    [],
  );
  const selectedGrouping = state.selectedGrouping;
  const setDrillPathByAllocationBreakdown = useCallback(
    (nextValue: DrillPathByAllocationBreakdownUpdater) => {
      setState((previous) => {
        const current = previous.drillPathsByGrouping[selectedGrouping];
        const resolved =
          typeof nextValue === "function"
            ? nextValue(current.allocation)
            : nextValue;
        return {
          ...previous,
          drillPathsByGrouping: {
            ...previous.drillPathsByGrouping,
            [selectedGrouping]: {
              ...current,
              allocation: {
                asset: normalizeDrillPath(resolved.asset),
                liability: normalizeDrillPath(resolved.liability),
              },
            },
          },
        };
      });
    },
    [selectedGrouping],
  );
  const setDrillPathByGainsLosses = useCallback(
    (nextValue: DrillPathByGainsLossesUpdater) => {
      setState((previous) => {
        const current = previous.drillPathsByGrouping[selectedGrouping];
        const resolved =
          typeof nextValue === "function"
            ? nextValue(current.gainsLosses)
            : nextValue;
        return {
          ...previous,
          drillPathsByGrouping: {
            ...previous.drillPathsByGrouping,
            [selectedGrouping]: {
              ...current,
              gainsLosses: normalizeDrillPath(resolved),
            },
          },
        };
      });
    },
    [selectedGrouping],
  );

  return {
    selectedGrouping,
    setSelectedGrouping,
    selectedBreakdown: state.selectedBreakdown,
    selectedChartType: state.selectedChartType,
    selectedAllocationBreakdown: state.selectedAllocationBreakdown,
    selectedAllocationChartType: state.selectedAllocationChartType,
    selectedGainsLossesChartType: state.selectedGainsLossesChartType,
    drillPathByBreakdown: state.drillPathByBreakdown,
    drillPathByAllocationBreakdown:
      state.drillPathsByGrouping[selectedGrouping].allocation,
    drillPathByGainsLosses:
      state.drillPathsByGrouping[selectedGrouping].gainsLosses,
    setSelectedBreakdown,
    setSelectedChartType,
    setSelectedAllocationBreakdown,
    setSelectedAllocationChartType,
    setSelectedGainsLossesChartType,
    setDrillPathByBreakdown,
    setDrillPathByAllocationBreakdown,
    setDrillPathByGainsLosses,
  };
}

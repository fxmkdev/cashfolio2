import { useCallback, useEffect, useState } from "react";
import type {
  AllocationBreakdownType,
  BreakdownChartType,
  BreakdownType,
} from "./-breakdown-types";

type DrillPathByBreakdown = Record<BreakdownType, string[]>;
type DrillPathByAllocationBreakdown = Record<AllocationBreakdownType, string[]>;

type PeriodPageSessionState = {
  selectedBreakdown: BreakdownType;
  selectedChartType: BreakdownChartType;
  selectedAllocationBreakdown: AllocationBreakdownType;
  selectedAllocationChartType: BreakdownChartType;
  drillPathByBreakdown: DrillPathByBreakdown;
  drillPathByAllocationBreakdown: DrillPathByAllocationBreakdown;
};

function isBreakdownType(value: unknown): value is BreakdownType {
  return value === "expense" || value === "income";
}

function isAllocationBreakdownType(
  value: unknown,
): value is AllocationBreakdownType {
  return value === "asset" || value === "liability";
}

function isBreakdownChartType(value: unknown): value is BreakdownChartType {
  return value === "donut" || value === "bar" || value === "table";
}

function normalizeDrillPath(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((segment) => (typeof segment === "string" ? segment.trim() : ""))
    .filter((segment) => segment.length > 0);
}

function getDefaultPeriodPageSessionState(): PeriodPageSessionState {
  return {
    selectedBreakdown: "expense",
    selectedChartType: "donut",
    selectedAllocationBreakdown: "asset",
    selectedAllocationChartType: "donut",
    drillPathByBreakdown: {
      expense: [],
      income: [],
    },
    drillPathByAllocationBreakdown: {
      asset: [],
      liability: [],
    },
  };
}

function parseStoredPeriodPageSessionState(
  rawValue: unknown,
): PeriodPageSessionState {
  const defaults = getDefaultPeriodPageSessionState();

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

  return {
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
    drillPathByBreakdown: {
      expense: normalizeDrillPath(drillPathByBreakdown.expense),
      income: normalizeDrillPath(drillPathByBreakdown.income),
    },
    drillPathByAllocationBreakdown: {
      asset: normalizeDrillPath(drillPathByAllocationBreakdown.asset),
      liability: normalizeDrillPath(drillPathByAllocationBreakdown.liability),
    },
  };
}

function loadPeriodPageSessionState(
  storageKey: string,
): PeriodPageSessionState {
  const defaults = getDefaultPeriodPageSessionState();

  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored == null) {
      return defaults;
    }

    return parseStoredPeriodPageSessionState(JSON.parse(stored));
  } catch {
    return defaults;
  }
}

export function usePeriodPageSessionState(accountBookId: string) {
  const storageKey = `cashfolio:periodPageState:${accountBookId}`;
  const [state, setState] = useState<PeriodPageSessionState>(
    getDefaultPeriodPageSessionState,
  );
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(false);
    setState(getDefaultPeriodPageSessionState());

    if (typeof window === "undefined") {
      return;
    }

    setState(loadPeriodPageSessionState(storageKey));
    setIsHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") {
      return;
    }

    sessionStorage.setItem(storageKey, JSON.stringify(state));
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

  const setDrillPathByBreakdown = useCallback(
    (nextValue: DrillPathByBreakdown) => {
      setState((previousState) => ({
        ...previousState,
        drillPathByBreakdown: {
          expense: normalizeDrillPath(nextValue.expense),
          income: normalizeDrillPath(nextValue.income),
        },
      }));
    },
    [],
  );

  const setDrillPathByAllocationBreakdown = useCallback(
    (nextValue: DrillPathByAllocationBreakdown) => {
      setState((previousState) => ({
        ...previousState,
        drillPathByAllocationBreakdown: {
          asset: normalizeDrillPath(nextValue.asset),
          liability: normalizeDrillPath(nextValue.liability),
        },
      }));
    },
    [],
  );

  return {
    selectedBreakdown: state.selectedBreakdown,
    selectedChartType: state.selectedChartType,
    selectedAllocationBreakdown: state.selectedAllocationBreakdown,
    selectedAllocationChartType: state.selectedAllocationChartType,
    drillPathByBreakdown: state.drillPathByBreakdown,
    drillPathByAllocationBreakdown: state.drillPathByAllocationBreakdown,
    setSelectedBreakdown,
    setSelectedChartType,
    setSelectedAllocationBreakdown,
    setSelectedAllocationChartType,
    setDrillPathByBreakdown,
    setDrillPathByAllocationBreakdown,
  };
}

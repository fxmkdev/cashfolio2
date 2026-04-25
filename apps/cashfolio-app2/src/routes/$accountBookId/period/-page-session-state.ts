import { useCallback, useEffect, useState } from "react";
import type {
  AllocationBreakdownType,
  BreakdownChartType,
  BreakdownType,
  GainsLossesChartType,
} from "./-breakdown-types";

type DrillPathByBreakdown = Record<BreakdownType, string[]>;
type DrillPathByAllocationBreakdown = Record<AllocationBreakdownType, string[]>;
type DrillPathByBreakdownUpdater =
  | DrillPathByBreakdown
  | ((previousValue: DrillPathByBreakdown) => DrillPathByBreakdown);
type DrillPathByAllocationBreakdownUpdater =
  | DrillPathByAllocationBreakdown
  | ((
      previousValue: DrillPathByAllocationBreakdown,
    ) => DrillPathByAllocationBreakdown);
type DrillPathByGainsLossesUpdater =
  | string[]
  | ((previousValue: string[]) => string[]);

type PeriodPageSessionState = {
  selectedBreakdown: BreakdownType;
  selectedChartType: BreakdownChartType;
  selectedAllocationBreakdown: AllocationBreakdownType;
  selectedAllocationChartType: BreakdownChartType;
  selectedGainsLossesChartType: GainsLossesChartType;
  drillPathByBreakdown: DrillPathByBreakdown;
  drillPathByAllocationBreakdown: DrillPathByAllocationBreakdown;
  drillPathByGainsLosses: string[];
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

export function getDefaultPeriodPageSessionState(): PeriodPageSessionState {
  return {
    selectedBreakdown: "expense",
    selectedChartType: "donut",
    selectedAllocationBreakdown: "asset",
    selectedAllocationChartType: "donut",
    selectedGainsLossesChartType: "waterfall",
    drillPathByBreakdown: {
      expense: [],
      income: [],
    },
    drillPathByAllocationBreakdown: {
      asset: [],
      liability: [],
    },
    drillPathByGainsLosses: [],
  };
}

export function parseStoredPeriodPageSessionState(
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
    selectedGainsLossesChartType: isGainsLossesChartType(
      stored.selectedGainsLossesChartType,
    )
      ? stored.selectedGainsLossesChartType
      : defaults.selectedGainsLossesChartType,
    drillPathByBreakdown: {
      expense: normalizeDrillPath(drillPathByBreakdown.expense),
      income: normalizeDrillPath(drillPathByBreakdown.income),
    },
    drillPathByAllocationBreakdown: {
      asset: normalizeDrillPath(drillPathByAllocationBreakdown.asset),
      liability: normalizeDrillPath(drillPathByAllocationBreakdown.liability),
    },
    drillPathByGainsLosses: normalizeDrillPath(stored.drillPathByGainsLosses),
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
          };
        })(),
      }));
    },
    [],
  );

  const setDrillPathByAllocationBreakdown = useCallback(
    (nextValue: DrillPathByAllocationBreakdownUpdater) => {
      setState((previousState) => ({
        ...previousState,
        drillPathByAllocationBreakdown: (() => {
          const resolvedValue =
            typeof nextValue === "function"
              ? nextValue(previousState.drillPathByAllocationBreakdown)
              : nextValue;

          return {
            asset: normalizeDrillPath(resolvedValue.asset),
            liability: normalizeDrillPath(resolvedValue.liability),
          };
        })(),
      }));
    },
    [],
  );
  const setDrillPathByGainsLosses = useCallback(
    (nextValue: DrillPathByGainsLossesUpdater) => {
      setState((previousState) => ({
        ...previousState,
        drillPathByGainsLosses: (() => {
          const resolvedValue =
            typeof nextValue === "function"
              ? nextValue(previousState.drillPathByGainsLosses)
              : nextValue;

          return normalizeDrillPath(resolvedValue);
        })(),
      }));
    },
    [],
  );

  return {
    selectedBreakdown: state.selectedBreakdown,
    selectedChartType: state.selectedChartType,
    selectedAllocationBreakdown: state.selectedAllocationBreakdown,
    selectedAllocationChartType: state.selectedAllocationChartType,
    selectedGainsLossesChartType: state.selectedGainsLossesChartType,
    drillPathByBreakdown: state.drillPathByBreakdown,
    drillPathByAllocationBreakdown: state.drillPathByAllocationBreakdown,
    drillPathByGainsLosses: state.drillPathByGainsLosses,
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

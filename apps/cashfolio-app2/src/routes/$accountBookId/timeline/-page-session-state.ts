import { useCallback, useEffect, useState } from "react";

export type TimelinePeriodMode = "month" | "year";

type TimelinePageSessionState = {
  periodMode: TimelinePeriodMode;
};

function isTimelinePeriodMode(value: unknown): value is TimelinePeriodMode {
  return value === "month" || value === "year";
}

export function getDefaultTimelinePageSessionState(): TimelinePageSessionState {
  return {
    periodMode: "month",
  };
}

export function parseStoredTimelinePageSessionState(
  rawValue: unknown,
): TimelinePageSessionState {
  const defaults = getDefaultTimelinePageSessionState();

  if (typeof rawValue !== "object" || rawValue == null) {
    return defaults;
  }

  const stored = rawValue as Record<string, unknown>;

  return {
    periodMode: isTimelinePeriodMode(stored.periodMode)
      ? stored.periodMode
      : defaults.periodMode,
  };
}

function loadTimelinePageSessionState(
  storageKey: string,
): TimelinePageSessionState {
  const defaults = getDefaultTimelinePageSessionState();

  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored == null) {
      return defaults;
    }

    return parseStoredTimelinePageSessionState(JSON.parse(stored));
  } catch {
    return defaults;
  }
}

export function useTimelinePageSessionState(accountBookId: string) {
  const storageKey = `cashfolio:timelinePageState:${accountBookId}`;
  const [state, setState] = useState<TimelinePageSessionState>(
    getDefaultTimelinePageSessionState,
  );
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(false);
    setState(getDefaultTimelinePageSessionState());

    if (typeof window === "undefined") {
      return;
    }

    setState(loadTimelinePageSessionState(storageKey));
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

  const setPeriodMode = useCallback((nextPeriodMode: TimelinePeriodMode) => {
    setState((previousState) => ({
      ...previousState,
      periodMode: nextPeriodMode,
    }));
  }, []);

  return {
    periodMode: state.periodMode,
    setPeriodMode,
  };
}

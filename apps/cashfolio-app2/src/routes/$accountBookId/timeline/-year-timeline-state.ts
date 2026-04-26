import type { PeriodTimelineResponse } from "@/server/period-timeline";
import type { TimelinePeriodMode } from "./-page-session-state";

export type YearTimelineState = {
  timeline: PeriodTimelineResponse | null;
  isLoading: boolean;
  error: string | null;
};

export function getDefaultYearTimelineState(): YearTimelineState {
  return {
    timeline: null,
    isLoading: false,
    error: null,
  };
}

export function shouldStartYearTimelineFetch(args: {
  periodMode: TimelinePeriodMode;
  state: YearTimelineState;
}): boolean {
  return (
    args.periodMode === "year" &&
    args.state.timeline == null &&
    !args.state.isLoading &&
    args.state.error == null
  );
}

export function startYearTimelineFetch(
  state: YearTimelineState,
): YearTimelineState {
  return {
    ...state,
    isLoading: true,
    error: null,
  };
}

export function finishYearTimelineFetchSuccess(args: {
  state: YearTimelineState;
  timeline: PeriodTimelineResponse;
}): YearTimelineState {
  return {
    ...args.state,
    timeline: args.timeline,
    isLoading: false,
    error: null,
  };
}

export function finishYearTimelineFetchFailure(args: {
  state: YearTimelineState;
  error: string;
}): YearTimelineState {
  return {
    ...args.state,
    isLoading: false,
    error: args.error,
  };
}

export function clearYearTimelineFetchError(
  state: YearTimelineState,
): YearTimelineState {
  return {
    ...state,
    error: null,
  };
}

import { describe, expect, test } from "vitest";
import {
  clearYearTimelineFetchError,
  finishYearTimelineFetchFailure,
  finishYearTimelineFetchSuccess,
  getDefaultYearTimelineState,
  shouldStartYearTimelineFetch,
  startYearTimelineFetch,
} from "./-year-timeline-state";

describe("year timeline lazy-loading state", () => {
  test("starts yearly fetch once when first switching to yearly mode", () => {
    const initialState = getDefaultYearTimelineState();

    expect(
      shouldStartYearTimelineFetch({
        periodMode: "year",
        state: initialState,
      }),
    ).toBe(true);

    const loadingState = startYearTimelineFetch(initialState);
    expect(
      shouldStartYearTimelineFetch({
        periodMode: "year",
        state: loadingState,
      }),
    ).toBe(false);
  });

  test("reuses cached yearly timeline after successful fetch", () => {
    const initialState = getDefaultYearTimelineState();
    const loadingState = startYearTimelineFetch(initialState);
    const loadedState = finishYearTimelineFetchSuccess({
      state: loadingState,
      timeline: {
        referenceCurrency: "CHF",
        points: [
          {
            periodValue: "2026",
            periodLabel: "2026",
            totalReturn: 120,
          },
        ],
      },
    });

    expect(
      shouldStartYearTimelineFetch({
        periodMode: "year",
        state: loadedState,
      }),
    ).toBe(false);
  });

  test("supports failed yearly fetch and retry", () => {
    const initialState = getDefaultYearTimelineState();
    const loadingState = startYearTimelineFetch(initialState);
    const failedState = finishYearTimelineFetchFailure({
      state: loadingState,
      error: "Unable to load yearly timeline.",
    });

    expect(
      shouldStartYearTimelineFetch({
        periodMode: "year",
        state: failedState,
      }),
    ).toBe(false);

    const retryReadyState = clearYearTimelineFetchError(failedState);
    expect(
      shouldStartYearTimelineFetch({
        periodMode: "year",
        state: retryReadyState,
      }),
    ).toBe(true);
  });
});

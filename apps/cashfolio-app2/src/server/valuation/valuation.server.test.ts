import { beforeEach, describe, expect, test, vi } from "vitest";

const getRateWithBacktracking = vi.hoisted(() => vi.fn());
const getRateWithBacktrackingDetails = vi.hoisted(() => vi.fn());
const getLatestAssumedAvailableHistoricalUtcDay = vi.hoisted(() => vi.fn());

vi.mock("./backtracking", () => ({
  getRateWithBacktracking,
  getRateWithBacktrackingDetails,
}));

vi.mock("./date-utils", async () => {
  const actual =
    await vi.importActual<typeof import("./date-utils")>("./date-utils");

  return {
    ...actual,
    getLatestAssumedAvailableHistoricalUtcDay,
  };
});

import {
  getCurrencyExchangeRate,
  getCurrencyExchangeRateDetails,
  getSecurityToCurrencyExchangeRate,
} from "./valuation.server";

describe("valuation server lookup context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLatestAssumedAvailableHistoricalUtcDay.mockReturnValue(
      new Date("2026-03-28T00:00:00.000Z"),
    );
    getRateWithBacktracking.mockResolvedValue(1);
    getRateWithBacktrackingDetails.mockResolvedValue({
      rate: 1,
      source: "timeSeries",
    });
  });

  test("computes latest fetchable date once for currency exchange lookups", async () => {
    const result = await getCurrencyExchangeRate({
      sourceCurrency: "CHF",
      targetCurrency: "EUR",
      date: new Date("2026-03-29T00:06:00.000Z"),
    });

    expect(result).toBe(1);
    expect(getLatestAssumedAvailableHistoricalUtcDay).toHaveBeenCalledTimes(1);
    expect(getRateWithBacktracking).toHaveBeenCalledTimes(2);

    const latestFetchableDates = getRateWithBacktracking.mock.calls.map(
      ([args]) => (args as { latestFetchableDate?: Date }).latestFetchableDate,
    );
    expect(latestFetchableDates).toHaveLength(2);
    expect(latestFetchableDates[0]?.toISOString()).toBe(
      "2026-03-28T00:00:00.000Z",
    );
    expect(latestFetchableDates[1]?.toISOString()).toBe(
      "2026-03-28T00:00:00.000Z",
    );
  });

  test("reports TimeSeries as permanent-cache source for detailed currency lookups", async () => {
    getRateWithBacktrackingDetails.mockResolvedValueOnce({
      rate: 0.9,
      source: "timeSeries",
    });

    const result = await getCurrencyExchangeRateDetails({
      sourceCurrency: "USD",
      targetCurrency: "EUR",
      date: new Date("2026-03-29T00:06:00.000Z"),
    });

    expect(result).toEqual({
      rate: 0.9,
      source: "timeSeries",
    });
  });

  test("reports fallback source for detailed currency lookups using fallback cache", async () => {
    getRateWithBacktrackingDetails.mockResolvedValueOnce({
      rate: 0.9,
      source: "fallback",
    });

    const result = await getCurrencyExchangeRateDetails({
      sourceCurrency: "USD",
      targetCurrency: "EUR",
      date: new Date("2026-03-29T00:06:00.000Z"),
    });

    expect(result.source).toBe("fallback");
  });

  test("reuses one cutoff decision across nested security+fx lookup", async () => {
    const result = await getSecurityToCurrencyExchangeRate({
      symbol: "AAPL",
      tradeCurrency: "EUR",
      targetCurrency: "CHF",
      date: new Date("2026-03-29T00:06:00.000Z"),
    });

    expect(result).toBe(1);
    expect(getLatestAssumedAvailableHistoricalUtcDay).toHaveBeenCalledTimes(1);
    expect(getRateWithBacktracking).toHaveBeenCalledTimes(3);

    const latestFetchableDates = getRateWithBacktracking.mock.calls.map(
      ([args]) => (args as { latestFetchableDate?: Date }).latestFetchableDate,
    );
    expect(latestFetchableDates).toHaveLength(3);
    expect(
      latestFetchableDates.every(
        (value) => value?.toISOString() === "2026-03-28T00:00:00.000Z",
      ),
    ).toBe(true);
  });
});

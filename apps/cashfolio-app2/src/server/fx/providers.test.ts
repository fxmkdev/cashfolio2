import { describe, expect, test, vi } from "vitest";
import {
  isNoDataProviderError,
  parseMarketstackEodResponse,
} from "./providers";
import { NO_DATA_FETCH_RESULT } from "./types";

describe("FX provider helpers", () => {
  test("treats marketstack quote-currency mismatch as unusable data", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = parseMarketstackEodResponse({
      response: {
        data: [{ close: 250, currency: "EUR" }],
      },
      symbol: "AAPL",
      tradeCurrency: "USD",
      date: new Date("2026-03-28T00:00:00.000Z"),
    });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  test("recognizes explicit no-data marketstack errors", () => {
    const result = parseMarketstackEodResponse({
      response: {
        error: {
          message: "did not return any results",
        },
      },
      symbol: "AAPL",
      tradeCurrency: "USD",
      date: new Date("2026-03-28T00:00:00.000Z"),
    });

    expect(result).toBe(NO_DATA_FETCH_RESULT);
  });

  test("detects no-data style provider errors", () => {
    expect(
      isNoDataProviderError({ code: 106, info: "No data available" }),
    ).toBe(true);
    expect(
      isNoDataProviderError({ code: 101, info: "no results for date" }),
    ).toBe(true);
    expect(
      isNoDataProviderError({ code: 101, info: "invalid access key" }),
    ).toBe(false);
  });

  test("throws for provider failures that are not explicit no-data", () => {
    expect(() =>
      parseMarketstackEodResponse({
        response: {
          error: {
            message: "invalid access key",
          },
        },
        symbol: "AAPL",
        tradeCurrency: "USD",
        date: new Date("2026-03-28T00:00:00.000Z"),
      }),
    ).toThrow("Marketstack request failed");
  });
});

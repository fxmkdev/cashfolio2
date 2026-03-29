import { describe, expect, test, vi } from "vitest";
import {
  fetchSecurityPriceFromMarketstack,
  fetchUsdPerCryptocurrencyRateFromCoinLayer,
  fetchUsdToCurrencyRateFromCurrencyLayer,
  isNoDataProviderError,
  parseMarketstackEodResponse,
} from "./providers";
import { NO_DATA_FETCH_RESULT } from "./types";

describe("Valuation provider helpers", () => {
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

  test("logs currencylayer request lifecycle without leaking access key", async () => {
    const originalApiKey = process.env.CURRENCYLAYER_API_KEY;
    const apiKey = "currencylayer-secret-token";
    process.env.CURRENCYLAYER_API_KEY = apiKey;

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          quotes: { USDCHF: 0.9 },
        }),
        { status: 200 },
      ),
    );
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await fetchUsdToCurrencyRateFromCurrencyLayer(
      "CHF",
      new Date("2026-03-28T00:00:00.000Z"),
    );

    expect(result).toBe(0.9);
    expect(infoSpy).toHaveBeenCalledWith(
      "Valuation provider request started",
      expect.objectContaining({
        provider: "currencylayer",
        sourceCurrency: "USD",
        targetCurrency: "CHF",
        date: "2026-03-28",
      }),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "Valuation provider response received",
      expect.objectContaining({
        provider: "currencylayer",
        outcome: "retrieved",
      }),
    );

    const combinedLogs = [...infoSpy.mock.calls, ...warnSpy.mock.calls]
      .flat()
      .map((entry) =>
        typeof entry === "string" ? entry : JSON.stringify(entry),
      )
      .join(" ");
    expect(combinedLogs).not.toContain(apiKey);

    fetchSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    if (originalApiKey == null) {
      delete process.env.CURRENCYLAYER_API_KEY;
    } else {
      process.env.CURRENCYLAYER_API_KEY = originalApiKey;
    }
  });

  test("logs coinlayer and marketstack request lifecycles", async () => {
    const originalCoinLayerApiKey = process.env.COINLAYER_API_KEY;
    const originalMarketstackApiKey = process.env.MARKETSTACK_API_KEY;
    process.env.COINLAYER_API_KEY = "coinlayer-secret-token";
    process.env.MARKETSTACK_API_KEY = "marketstack-secret-token";

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            rates: { BTC: 42000 },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ close: 180, currency: "USD" }],
          }),
          { status: 200 },
        ),
      );
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const cryptoResult = await fetchUsdPerCryptocurrencyRateFromCoinLayer(
      "BTC",
      new Date("2026-03-28T00:00:00.000Z"),
    );
    const securityResult = await fetchSecurityPriceFromMarketstack(
      "AAPL",
      "USD",
      new Date("2026-03-28T00:00:00.000Z"),
    );

    expect(cryptoResult).toBe(42000);
    expect(securityResult).toBe(180);
    expect(infoSpy).toHaveBeenCalledWith(
      "Valuation provider request started",
      expect.objectContaining({
        provider: "coinlayer",
        cryptocurrency: "BTC",
      }),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "Valuation provider request started",
      expect.objectContaining({
        provider: "marketstack",
        symbol: "AAPL",
        tradeCurrency: "USD",
      }),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "Valuation provider response received",
      expect.objectContaining({
        provider: "coinlayer",
        outcome: "retrieved",
      }),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "Valuation provider response received",
      expect.objectContaining({
        provider: "marketstack",
        outcome: "retrieved",
      }),
    );

    fetchSpy.mockRestore();
    infoSpy.mockRestore();
    if (originalCoinLayerApiKey == null) {
      delete process.env.COINLAYER_API_KEY;
    } else {
      process.env.COINLAYER_API_KEY = originalCoinLayerApiKey;
    }
    if (originalMarketstackApiKey == null) {
      delete process.env.MARKETSTACK_API_KEY;
    } else {
      process.env.MARKETSTACK_API_KEY = originalMarketstackApiKey;
    }
  });
});

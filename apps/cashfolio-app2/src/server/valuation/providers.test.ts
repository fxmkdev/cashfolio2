import { beforeEach, describe, expect, test, vi } from "vitest";

const recordValuationProviderRequest = vi.hoisted(() => vi.fn());

vi.mock("./provider-usage", () => ({
  recordValuationProviderRequest,
  VALUATION_PROVIDER_REQUEST_REASONS: {
    INITIAL_PROBE: "INITIAL_PROBE",
    BACKTRACK_PROBE: "BACKTRACK_PROBE",
    RATE_LIMIT_RETRY: "RATE_LIMIT_RETRY",
  },
}));

import {
  fetchSecurityPriceFromMarketstack,
  fetchUsdPerCryptocurrencyRateFromCoinLayer,
  fetchUsdToCurrencyRateFromCurrencyLayer,
  isNoDataProviderError,
  parseMarketstackEodResponse,
} from "./providers";
import { NO_DATA_FETCH_RESULT } from "./types";

describe("Valuation provider helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  test("treats non-positive marketstack close prices as missing data", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = parseMarketstackEodResponse({
      response: {
        data: [{ close: 0 }],
      },
      symbol: "AAPL",
      tradeCurrency: "USD",
      date: new Date("2026-03-28T00:00:00.000Z"),
    });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      "Marketstack security close price is non-positive; treating as missing data.",
      expect.objectContaining({
        symbol: "AAPL",
        tradeCurrency: "USD",
        closePrice: 0,
        date: "2026-03-28",
      }),
    );
    warnSpy.mockRestore();
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

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            quotes: { USDCHF: 0.9 },
          }),
          { status: 200 },
        ),
      );

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
      expect(recordValuationProviderRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "CURRENCYLAYER",
          unitType: "CURRENCY",
          outcome: "RETRIEVED",
          requestReason: "INITIAL_PROBE",
          currency: "CHF",
          httpStatus: 200,
          retryCount: 0,
          durationMs: expect.any(Number),
        }),
      );

      const combinedLogs = [...infoSpy.mock.calls, ...warnSpy.mock.calls]
        .flat()
        .map((entry) =>
          typeof entry === "string" ? entry : JSON.stringify(entry),
        )
        .join(" ");
      expect(combinedLogs).not.toContain(apiKey);
    } finally {
      fetchSpy.mockRestore();
      infoSpy.mockRestore();
      warnSpy.mockRestore();
      if (originalApiKey == null) {
        delete process.env.CURRENCYLAYER_API_KEY;
      } else {
        process.env.CURRENCYLAYER_API_KEY = originalApiKey;
      }
    }
  });

  test("logs coinlayer and marketstack request lifecycles", async () => {
    const originalCoinLayerApiKey = process.env.COINLAYER_API_KEY;
    const originalMarketstackApiKey = process.env.MARKETSTACK_API_KEY;
    process.env.COINLAYER_API_KEY = "coinlayer-secret-token";
    process.env.MARKETSTACK_API_KEY = "marketstack-secret-token";

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    try {
      fetchSpy
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
      expect(recordValuationProviderRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "COINLAYER",
          unitType: "CRYPTOCURRENCY",
          outcome: "RETRIEVED",
          requestReason: "INITIAL_PROBE",
          cryptocurrency: "BTC",
          httpStatus: 200,
        }),
      );
      expect(recordValuationProviderRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "MARKETSTACK",
          unitType: "SECURITY",
          outcome: "RETRIEVED",
          requestReason: "INITIAL_PROBE",
          symbol: "AAPL",
          tradeCurrency: "USD",
          httpStatus: 200,
        }),
      );
    } finally {
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
    }
  });

  test("uses e2e fallback API key when provider keys are unset", async () => {
    const originalCurrencyLayerApiKey = process.env.CURRENCYLAYER_API_KEY;
    const originalE2ETestMode = process.env.E2E_TEST_MODE;
    delete process.env.CURRENCYLAYER_API_KEY;
    process.env.E2E_TEST_MODE = "true";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          quotes: { USDCHF: 0.9 },
        }),
        { status: 200 },
      ),
    );

    const result = await fetchUsdToCurrencyRateFromCurrencyLayer(
      "CHF",
      new Date("2026-03-28T00:00:00.000Z"),
    );

    expect(result).toBe(0.9);
    expect(fetchSpy).toHaveBeenCalledOnce();

    fetchSpy.mockRestore();
    if (originalCurrencyLayerApiKey == null) {
      delete process.env.CURRENCYLAYER_API_KEY;
    } else {
      process.env.CURRENCYLAYER_API_KEY = originalCurrencyLayerApiKey;
    }
    if (originalE2ETestMode == null) {
      delete process.env.E2E_TEST_MODE;
    } else {
      process.env.E2E_TEST_MODE = originalE2ETestMode;
    }
  });

  test("records currencylayer no-data and missing-rate outcomes", async () => {
    const originalApiKey = process.env.CURRENCYLAYER_API_KEY;
    process.env.CURRENCYLAYER_API_KEY = "currencylayer-secret-token";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    try {
      fetchSpy
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              success: false,
              error: { code: 106, info: "No data available" },
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              success: true,
              quotes: {},
            }),
            { status: 200 },
          ),
        );

      const noDataResult = await fetchUsdToCurrencyRateFromCurrencyLayer(
        "CHF",
        new Date("2026-03-28T00:00:00.000Z"),
      );
      const missingRateResult = await fetchUsdToCurrencyRateFromCurrencyLayer(
        "EUR",
        new Date("2026-03-28T00:00:00.000Z"),
      );

      expect(noDataResult).toBe(NO_DATA_FETCH_RESULT);
      expect(missingRateResult).toBeNull();
      expect(recordValuationProviderRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "CURRENCYLAYER",
          outcome: "NO_DATA",
          currency: "CHF",
          httpStatus: 200,
        }),
      );
      expect(recordValuationProviderRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "CURRENCYLAYER",
          outcome: "MISSING_RATE",
          currency: "EUR",
          httpStatus: 200,
        }),
      );
    } finally {
      fetchSpy.mockRestore();
      if (originalApiKey == null) {
        delete process.env.CURRENCYLAYER_API_KEY;
      } else {
        process.env.CURRENCYLAYER_API_KEY = originalApiKey;
      }
    }
  });

  test("records request, timeout, HTTP, and provider error outcomes", async () => {
    const originalApiKey = process.env.COINLAYER_API_KEY;
    process.env.COINLAYER_API_KEY = "coinlayer-secret-token";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const timeoutError = new Error("aborted");
      timeoutError.name = "AbortError";
      fetchSpy
        .mockRejectedValueOnce(new Error("network failed access_key=secret"))
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce(new Response("Nope", { status: 503 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              success: false,
              error: { code: 101, info: "invalid access key" },
            }),
            { status: 200 },
          ),
        );

      await expect(
        fetchUsdPerCryptocurrencyRateFromCoinLayer(
          "BTC",
          new Date("2026-03-28T00:00:00.000Z"),
        ),
      ).rejects.toThrow("network failed");
      await expect(
        fetchUsdPerCryptocurrencyRateFromCoinLayer(
          "BTC",
          new Date("2026-03-28T00:00:00.000Z"),
        ),
      ).rejects.toThrow("Coinlayer request timed out");
      await expect(
        fetchUsdPerCryptocurrencyRateFromCoinLayer(
          "BTC",
          new Date("2026-03-28T00:00:00.000Z"),
        ),
      ).rejects.toThrow("Coinlayer request failed with 503");
      await expect(
        fetchUsdPerCryptocurrencyRateFromCoinLayer(
          "BTC",
          new Date("2026-03-28T00:00:00.000Z"),
        ),
      ).rejects.toThrow("Coinlayer request failed: invalid access key");

      expect(recordValuationProviderRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "COINLAYER",
          outcome: "REQUEST_ERROR",
          errorMessage: "network failed access_key=[redacted]",
        }),
      );
      expect(recordValuationProviderRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "COINLAYER",
          outcome: "TIMEOUT",
          errorMessage: "Coinlayer request timed out",
        }),
      );
      expect(recordValuationProviderRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "COINLAYER",
          outcome: "HTTP_ERROR",
          httpStatus: 503,
        }),
      );
      expect(recordValuationProviderRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "COINLAYER",
          outcome: "PROVIDER_ERROR",
          httpStatus: 200,
          errorMessage: "invalid access key",
        }),
      );
    } finally {
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      if (originalApiKey == null) {
        delete process.env.COINLAYER_API_KEY;
      } else {
        process.env.COINLAYER_API_KEY = originalApiKey;
      }
    }
  });

  test("records marketstack rate-limit retries separately", async () => {
    const originalApiKey = process.env.MARKETSTACK_API_KEY;
    process.env.MARKETSTACK_API_KEY = "marketstack-secret-token";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      fetchSpy
        .mockResolvedValueOnce(new Response("Rate limited", { status: 429 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: [{ close: 180, currency: "USD" }],
            }),
            { status: 200 },
          ),
        );

      const result = await fetchSecurityPriceFromMarketstack(
        "AAPL",
        "USD",
        new Date("2026-03-28T00:00:00.000Z"),
      );

      expect(result).toBe(180);
      expect(recordValuationProviderRequest).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          provider: "MARKETSTACK",
          outcome: "RATE_LIMIT_RETRY",
          requestReason: "INITIAL_PROBE",
          retryCount: 0,
          httpStatus: 429,
        }),
      );
      expect(recordValuationProviderRequest).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          provider: "MARKETSTACK",
          outcome: "RETRIEVED",
          requestReason: "RATE_LIMIT_RETRY",
          retryCount: 1,
          httpStatus: 200,
        }),
      );
    } finally {
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      if (originalApiKey == null) {
        delete process.env.MARKETSTACK_API_KEY;
      } else {
        process.env.MARKETSTACK_API_KEY = originalApiKey;
      }
    }
  });
});

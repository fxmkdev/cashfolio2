import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerFn = vi.hoisted(() =>
  vi.fn(() => {
    let validate: ((data: unknown) => unknown) | undefined;
    const chain = {
      inputValidator: vi.fn((validator: (data: unknown) => unknown) => {
        validate = validator;
        return chain;
      }),
      handler: vi.fn((handler: ({ data }: { data: unknown }) => unknown) => {
        return async ({ data }: { data: unknown }) => {
          const validatedData = validate ? validate(data) : data;
          return handler({ data: validatedData });
        };
      }),
    };
    return chain;
  }),
);

const ensureUser = vi.hoisted(() => vi.fn());
const getRedisClient = vi.hoisted(() => vi.fn());
const getCurrencyExchangeRate = vi.hoisted(() => vi.fn());
const getCryptocurrencyToCurrencyExchangeRate = vi.hoisted(() => vi.fn());
const getSecurityToCurrencyExchangeRate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("../../users/functions.server", () => ({
  ensureUser,
}));

vi.mock("../../redis.server", () => ({
  getRedisClient,
}));

vi.mock("./valuation.server", () => ({
  getCurrencyExchangeRate,
  getCryptocurrencyToCurrencyExchangeRate,
  getSecurityToCurrencyExchangeRate,
}));

import {
  getValuationCacheSeries,
  getValuationCacheUnits,
} from "./valuation-cache";

describe("valuation-cache server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    ensureUser.mockResolvedValue({ id: "user-1" });
    getRedisClient.mockResolvedValue(null);
  });

  it("deduplicates and normalizes all permanent valuation TimeSeries keys", async () => {
    const keysByPattern: Record<string, string[]> = {
      "valuation:currencylayer:USD:*": [
        "valuation:currencylayer:USD:eur",
        "valuation:currencylayer:USD:EUR",
        "valuation:currencylayer:USD:chf",
      ],
      "valuation:coinlayer:USD:*": [
        "valuation:coinlayer:USD:btc",
        "valuation:coinlayer:USD:BTC",
      ],
      "valuation:marketstack:*:*": [
        "valuation:marketstack:aapl:usd",
        "valuation:marketstack:AAPL:USD",
        "valuation:marketstack:AAPL:CHF",
        "valuation:marketstack:fallback:AAPL:USD:1767225600000",
      ],
    };
    const redis = {
      scanIterator: vi.fn(({ MATCH }: { MATCH: string }) =>
        (async function* scanKeys() {
          yield keysByPattern[MATCH] ?? [];
        })(),
      ),
    };
    getRedisClient.mockResolvedValue(redis);

    const result = await getValuationCacheUnits({
      data: {},
    });

    expect(ensureUser).toHaveBeenCalledTimes(1);
    expect(redis.scanIterator).toHaveBeenCalledWith({
      MATCH: "valuation:currencylayer:USD:*",
      COUNT: 100,
    });
    expect(redis.scanIterator).toHaveBeenCalledWith({
      MATCH: "valuation:coinlayer:USD:*",
      COUNT: 100,
    });
    expect(redis.scanIterator).toHaveBeenCalledWith({
      MATCH: "valuation:marketstack:*:*",
      COUNT: 100,
    });

    expect(result).toEqual({
      currencyUnits: [
        {
          unitType: "CURRENCY",
          label: "CHF",
          unitKey: "currency:CHF",
          currency: "CHF",
        },
        {
          unitType: "CURRENCY",
          label: "EUR",
          unitKey: "currency:EUR",
          currency: "EUR",
        },
      ],
      cryptocurrencyUnits: [
        {
          unitType: "CRYPTOCURRENCY",
          label: "BTC",
          unitKey: "crypto:BTC",
          cryptocurrency: "BTC",
        },
      ],
      securityUnits: [
        {
          unitType: "SECURITY",
          label: "AAPL (CHF)",
          unitKey: "security:AAPL:CHF",
          symbol: "AAPL",
          tradeCurrency: "CHF",
        },
        {
          unitType: "SECURITY",
          label: "AAPL (USD)",
          unitKey: "security:AAPL:USD",
          symbol: "AAPL",
          tradeCurrency: "USD",
        },
      ],
    });
  });

  it("maps series requests to cache keys and returns sorted time-series points", async () => {
    const redis = {
      exists: vi.fn().mockResolvedValue(1),
      ts: {
        range: vi.fn().mockResolvedValue([
          { timestamp: Date.UTC(2026, 0, 2), value: 1.3 },
          { timestamp: Date.UTC(2026, 0, 1), value: 1.2 },
        ]),
      },
    };
    getRedisClient.mockResolvedValue(redis);

    const result = await getValuationCacheSeries({
      data: {
        unitType: "CURRENCY",
        currency: "eur",
      },
    });

    expect(ensureUser).toHaveBeenCalledTimes(1);
    expect(redis.exists).toHaveBeenCalledWith(
      "valuation:currencylayer:USD:EUR",
    );
    expect(redis.ts.range).toHaveBeenCalledWith(
      "valuation:currencylayer:USD:EUR",
      "-",
      "+",
    );
    expect(result).toEqual({
      cacheAvailable: true,
      points: [
        {
          timestamp: Date.UTC(2026, 0, 1),
          date: "2026-01-01",
          value: 1.2,
        },
        {
          timestamp: Date.UTC(2026, 0, 2),
          date: "2026-01-02",
          value: 1.3,
        },
      ],
    });
  });

  it("returns empty points for unavailable cache client or missing series", async () => {
    getRedisClient.mockResolvedValue(null);

    const unavailable = await getValuationCacheSeries({
      data: {
        unitType: "CRYPTOCURRENCY",
        cryptocurrency: "BTC",
      },
    });

    expect(unavailable).toEqual({
      cacheAvailable: false,
      points: [],
    });

    const redis = {
      exists: vi.fn().mockResolvedValue(0),
      ts: {
        range: vi.fn(),
      },
    };
    getRedisClient.mockResolvedValue(redis);

    const missingSeries = await getValuationCacheSeries({
      data: {
        unitType: "SECURITY",
        symbol: "AAPL",
        tradeCurrency: "USD",
      },
    });

    expect(redis.exists).toHaveBeenCalledWith("valuation:marketstack:AAPL:USD");
    expect(redis.ts.range).not.toHaveBeenCalled();
    expect(missingSeries).toEqual({
      cacheAvailable: true,
      points: [],
    });
  });

  it("does not use live valuation providers for cache reads", async () => {
    const redis = {
      exists: vi.fn().mockResolvedValue(1),
      ts: {
        range: vi.fn().mockResolvedValue([]),
      },
    };
    getRedisClient.mockResolvedValue(redis);

    await getValuationCacheSeries({
      data: {
        unitType: "SECURITY",
        symbol: "MSFT",
        tradeCurrency: "USD",
      },
    });

    expect(getCurrencyExchangeRate).not.toHaveBeenCalled();
    expect(getCryptocurrencyToCurrencyExchangeRate).not.toHaveBeenCalled();
    expect(getSecurityToCurrencyExchangeRate).not.toHaveBeenCalled();
  });

  it("returns a 400 response when unitType is invalid", async () => {
    await expect(
      getValuationCacheSeries({
        data: {
          unitType: "INVALID",
        } as never,
      }),
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it("validates valuation cache unit input before authorization", async () => {
    await expect(
      getValuationCacheUnits({
        data: null as never,
      }),
    ).rejects.toThrow("Input must be an object.");

    expect(ensureUser).not.toHaveBeenCalled();
  });

  it("validates valuation cache series input before authorization", async () => {
    await expect(
      getValuationCacheSeries({
        data: null as never,
      }),
    ).rejects.toThrow("Input must be an object.");

    await expect(
      getValuationCacheSeries({
        data: {
          currency: "EUR",
        } as never,
      }),
    ).rejects.toMatchObject({
      status: 400,
    });

    expect(ensureUser).not.toHaveBeenCalled();
  });

  it("logs cache series read failures only once while returning non-fatal empty data", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const redis = {
      exists: vi.fn().mockResolvedValue(1),
      ts: {
        range: vi.fn().mockRejectedValue(new Error("read failed")),
      },
    };
    getRedisClient.mockResolvedValue(redis);

    const firstResult = await getValuationCacheSeries({
      data: {
        unitType: "CRYPTOCURRENCY",
        cryptocurrency: "BTC",
      },
    });
    const secondResult = await getValuationCacheSeries({
      data: {
        unitType: "CRYPTOCURRENCY",
        cryptocurrency: "BTC",
      },
    });

    expect(firstResult).toEqual({ cacheAvailable: false, points: [] });
    expect(secondResult).toEqual({ cacheAvailable: false, points: [] });
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});

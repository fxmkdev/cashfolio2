import { beforeEach, describe, expect, it, vi } from "vitest";
import { Unit } from "../.prisma-client/enums";

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

const ensureAuthorizedForAccountBookId = vi.hoisted(() => vi.fn());
const getRedisClient = vi.hoisted(() => vi.fn());
const getCurrencyExchangeRate = vi.hoisted(() => vi.fn());
const getCryptocurrencyToCurrencyExchangeRate = vi.hoisted(() => vi.fn());
const getSecurityToCurrencyExchangeRate = vi.hoisted(() => vi.fn());

const prisma = vi.hoisted(() => ({
  accountBook: {
    findUniqueOrThrow: vi.fn(),
  },
  account: {
    findMany: vi.fn(),
  },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId,
}));

vi.mock("../prisma.server", () => ({
  prisma,
}));

vi.mock("../redis.server", () => ({
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

    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      referenceCurrency: "CHF",
    });
    prisma.account.findMany.mockResolvedValue([]);
    getRedisClient.mockResolvedValue(null);
  });

  it("deduplicates units, normalizes casing, excludes reference currency, and includes all account states", async () => {
    prisma.account.findMany.mockResolvedValue([
      {
        unit: Unit.CURRENCY,
        currency: "eur",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        isActive: true,
      },
      {
        unit: Unit.CURRENCY,
        currency: "EUR",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        isActive: false,
      },
      {
        unit: Unit.CURRENCY,
        currency: " chf ",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        isActive: true,
      },
      {
        unit: Unit.CRYPTOCURRENCY,
        currency: null,
        cryptocurrency: "btc",
        symbol: null,
        tradeCurrency: null,
        isActive: true,
      },
      {
        unit: Unit.CRYPTOCURRENCY,
        currency: null,
        cryptocurrency: "BTC",
        symbol: null,
        tradeCurrency: null,
        isActive: false,
      },
      {
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "aapl",
        tradeCurrency: "usd",
        isActive: true,
      },
      {
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "AAPL",
        tradeCurrency: "USD",
        isActive: false,
      },
      {
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "AAPL",
        tradeCurrency: "CHF",
        isActive: true,
      },
    ]);

    const result = await getValuationCacheUnits({
      data: { accountBookId: "book-1" },
    });

    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-1");
    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: { accountBookId: "book-1" },
      select: {
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
      },
    });

    expect(result).toEqual({
      currencyUnits: [
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
        accountBookId: "book-2",
        unitType: "CURRENCY",
        currency: "eur",
      },
    });

    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-2");
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
        accountBookId: "book-3",
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
        accountBookId: "book-3",
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
        accountBookId: "book-4",
        unitType: "SECURITY",
        symbol: "MSFT",
        tradeCurrency: "USD",
      },
    });

    expect(getCurrencyExchangeRate).not.toHaveBeenCalled();
    expect(getCryptocurrencyToCurrencyExchangeRate).not.toHaveBeenCalled();
    expect(getSecurityToCurrencyExchangeRate).not.toHaveBeenCalled();
  });
});

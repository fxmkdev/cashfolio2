import { createServerFn } from "@tanstack/react-start";
import { Unit } from "../.prisma-client/enums";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { prisma } from "../prisma.server";
import { getRedisClient } from "../redis.server";
import { toDayString } from "./valuation/date-utils";
import {
  getCryptocurrencyRedisSeriesKey,
  getCurrencyRedisSeriesKey,
  getSecurityRedisSeriesKey,
} from "./valuation/keys";

export type ValuationUnitTab = "CURRENCY" | "CRYPTOCURRENCY" | "SECURITY";

export type ValuationCacheUnitRow = {
  unitType: ValuationUnitTab;
  label: string;
  unitKey: string;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
};

export type ValuationCacheSeriesPoint = {
  timestamp: number;
  date: string;
  value: number;
};

export type ValuationCacheUnitsResponse = {
  currencyUnits: ValuationCacheUnitRow[];
  cryptocurrencyUnits: ValuationCacheUnitRow[];
  securityUnits: ValuationCacheUnitRow[];
};

export type ValuationCacheSeriesResponse = {
  cacheAvailable: boolean;
  points: ValuationCacheSeriesPoint[];
};

type GetValuationCacheUnitsInput = {
  accountBookId: string;
};

type GetValuationCacheSeriesInput = {
  accountBookId: string;
  unitType: ValuationUnitTab;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
};

function normalizeUnitCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function getSeriesKey(input: GetValuationCacheSeriesInput): string {
  if (input.unitType === "CURRENCY") {
    const currency = normalizeUnitCode(input.currency);
    if (!currency) {
      throw new Response("Currency is required for CURRENCY series.", {
        status: 400,
      });
    }
    return getCurrencyRedisSeriesKey(currency);
  }

  if (input.unitType === "CRYPTOCURRENCY") {
    const cryptocurrency = normalizeUnitCode(input.cryptocurrency);
    if (!cryptocurrency) {
      throw new Response(
        "Cryptocurrency is required for CRYPTOCURRENCY series.",
        { status: 400 },
      );
    }
    return getCryptocurrencyRedisSeriesKey(cryptocurrency);
  }

  const symbol = normalizeUnitCode(input.symbol);
  const tradeCurrency = normalizeUnitCode(input.tradeCurrency);
  if (!symbol || !tradeCurrency) {
    throw new Response(
      "Symbol and tradeCurrency are required for SECURITY series.",
      { status: 400 },
    );
  }

  return getSecurityRedisSeriesKey(symbol, tradeCurrency);
}

function toSortedUnits(unitsByKey: Map<string, ValuationCacheUnitRow>) {
  return Array.from(unitsByKey.values()).toSorted((left, right) =>
    left.label.localeCompare(right.label),
  );
}

export const getValuationCacheUnits = createServerFn({ method: "GET" })
  .inputValidator((data: GetValuationCacheUnitsInput) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);

    const [accountBook, accounts] = await Promise.all([
      prisma.accountBook.findUniqueOrThrow({
        where: { id: data.accountBookId },
        select: { referenceCurrency: true },
      }),
      prisma.account.findMany({
        where: { accountBookId: data.accountBookId },
        select: {
          unit: true,
          currency: true,
          cryptocurrency: true,
          symbol: true,
          tradeCurrency: true,
        },
      }),
    ]);

    const referenceCurrency = normalizeUnitCode(accountBook.referenceCurrency);
    const currencyUnitsByKey = new Map<string, ValuationCacheUnitRow>();
    const cryptocurrencyUnitsByKey = new Map<string, ValuationCacheUnitRow>();
    const securityUnitsByKey = new Map<string, ValuationCacheUnitRow>();

    for (const account of accounts) {
      if (account.unit === Unit.CURRENCY) {
        const currency = normalizeUnitCode(account.currency);
        if (!currency || currency === referenceCurrency) {
          continue;
        }

        const unitKey = `currency:${currency}`;
        if (!currencyUnitsByKey.has(unitKey)) {
          currencyUnitsByKey.set(unitKey, {
            unitType: "CURRENCY",
            label: currency,
            unitKey,
            currency,
          });
        }
        continue;
      }

      if (account.unit === Unit.CRYPTOCURRENCY) {
        const cryptocurrency = normalizeUnitCode(account.cryptocurrency);
        if (!cryptocurrency) {
          continue;
        }

        const unitKey = `crypto:${cryptocurrency}`;
        if (!cryptocurrencyUnitsByKey.has(unitKey)) {
          cryptocurrencyUnitsByKey.set(unitKey, {
            unitType: "CRYPTOCURRENCY",
            label: cryptocurrency,
            unitKey,
            cryptocurrency,
          });
        }
        continue;
      }

      if (account.unit === Unit.SECURITY) {
        const symbol = normalizeUnitCode(account.symbol);
        const tradeCurrency = normalizeUnitCode(account.tradeCurrency);
        if (!symbol || !tradeCurrency) {
          continue;
        }

        const unitKey = `security:${symbol}:${tradeCurrency}`;
        if (!securityUnitsByKey.has(unitKey)) {
          securityUnitsByKey.set(unitKey, {
            unitType: "SECURITY",
            label: `${symbol} (${tradeCurrency})`,
            unitKey,
            symbol,
            tradeCurrency,
          });
        }
      }
    }

    return {
      currencyUnits: toSortedUnits(currencyUnitsByKey),
      cryptocurrencyUnits: toSortedUnits(cryptocurrencyUnitsByKey),
      securityUnits: toSortedUnits(securityUnitsByKey),
    } satisfies ValuationCacheUnitsResponse;
  });

export const getValuationCacheSeries = createServerFn({ method: "GET" })
  .inputValidator((data: GetValuationCacheSeriesInput) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);

    const seriesKey = getSeriesKey(data);
    const redis = await getRedisClient();
    if (!redis) {
      return {
        cacheAvailable: false,
        points: [],
      } satisfies ValuationCacheSeriesResponse;
    }

    try {
      const exists = await redis.exists(seriesKey);
      if (exists !== 1) {
        return {
          cacheAvailable: true,
          points: [],
        } satisfies ValuationCacheSeriesResponse;
      }

      const entries = await redis.ts.range(seriesKey, "-", "+");
      const points = entries
        .map((entry) => ({
          timestamp: entry.timestamp,
          date: toDayString(new Date(entry.timestamp)),
          value: entry.value,
        }))
        .toSorted((left, right) => left.timestamp - right.timestamp);

      return {
        cacheAvailable: true,
        points,
      } satisfies ValuationCacheSeriesResponse;
    } catch (error) {
      console.warn("Failed to read valuation cache TimeSeries data.", {
        seriesKey,
        error,
      });
      return {
        cacheAvailable: false,
        points: [],
      } satisfies ValuationCacheSeriesResponse;
    }
  });

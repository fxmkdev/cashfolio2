import { createServerFn } from "@tanstack/react-start";
import {
  isValuationUnitTab,
  type ValuationUnitTab,
} from "../../shared/valuation-unit-tabs";
import { Unit } from "../../.prisma-client/enums";
import { ensureAuthorizedForAccountBookId } from "../../account-books/functions.server";
import { prisma } from "../../prisma.server";
import { getRedisClient } from "../../redis.server";
import { toDayString } from "./date-utils";
import {
  getCryptocurrencyRedisSeriesKey,
  getCurrencyRedisSeriesKey,
  getSecurityRedisSeriesKey,
} from "./keys";

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

let hasWarnedValuationCacheSeriesReadFailure = false;

function normalizeUnitCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function validateGetValuationCacheSeriesInput(
  data: GetValuationCacheSeriesInput,
): GetValuationCacheSeriesInput {
  const unitType = (data as { unitType?: unknown }).unitType;
  if (!isValuationUnitTab(unitType)) {
    throw new Response(
      "Invalid unitType. Expected CURRENCY, CRYPTOCURRENCY, or SECURITY.",
      { status: 400 },
    );
  }

  return data;
}

function getSeriesKey(input: GetValuationCacheSeriesInput): string {
  switch (input.unitType) {
    case "CURRENCY": {
      const currency = normalizeUnitCode(input.currency);
      if (!currency) {
        throw new Response("Currency is required for CURRENCY series.", {
          status: 400,
        });
      }
      return getCurrencyRedisSeriesKey(currency);
    }
    case "CRYPTOCURRENCY": {
      const cryptocurrency = normalizeUnitCode(input.cryptocurrency);
      if (!cryptocurrency) {
        throw new Response(
          "Cryptocurrency is required for CRYPTOCURRENCY series.",
          { status: 400 },
        );
      }
      return getCryptocurrencyRedisSeriesKey(cryptocurrency);
    }
    case "SECURITY": {
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
    default:
      throw new Response(
        "Invalid unitType. Expected CURRENCY, CRYPTOCURRENCY, or SECURITY.",
        { status: 400 },
      );
  }
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

    const accounts = await prisma.account.findMany({
      where: { accountBookId: data.accountBookId },
      select: {
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
      },
    });
    const currencyUnitsByKey = new Map<string, ValuationCacheUnitRow>();
    const cryptocurrencyUnitsByKey = new Map<string, ValuationCacheUnitRow>();
    const securityUnitsByKey = new Map<string, ValuationCacheUnitRow>();

    for (const account of accounts) {
      if (account.unit === Unit.CURRENCY) {
        const currency = normalizeUnitCode(account.currency);
        if (!currency) {
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
  .inputValidator(validateGetValuationCacheSeriesInput)
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
      if (!hasWarnedValuationCacheSeriesReadFailure) {
        console.warn("Failed to read valuation cache TimeSeries data.", {
          seriesKey,
          error,
        });
        hasWarnedValuationCacheSeriesReadFailure = true;
      }
      return {
        cacheAvailable: false,
        points: [],
      } satisfies ValuationCacheSeriesResponse;
    }
  });

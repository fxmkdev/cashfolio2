import { createServerFn } from "@tanstack/react-start";
import {
  isValuationUnitTab,
  type ValuationUnitTab,
} from "../../shared/valuation-unit-tabs";
import { getRedisClient } from "../../redis.server";
import { ensureUser } from "../../users/functions.server";
import { assertRecord } from "../input-validation";
import { BASE_CURRENCY } from "./constants";
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
  readonly _empty?: never;
};

type GetValuationCacheSeriesInput = {
  unitType: ValuationUnitTab;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
};

let hasWarnedValuationCacheUnitsReadFailure = false;
let hasWarnedValuationCacheSeriesReadFailure = false;

function normalizeUnitCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function getOptionalStringField(
  data: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = data[field];
  return typeof value === "string" ? value : undefined;
}

function validateGetValuationCacheUnitsInput(
  data: unknown,
): GetValuationCacheUnitsInput {
  assertRecord(data);

  return {};
}

function validateGetValuationCacheSeriesInput(
  data: unknown,
): GetValuationCacheSeriesInput {
  assertRecord(data);

  const unitType = data.unitType;
  if (!isValuationUnitTab(unitType)) {
    throw new Response(
      "Invalid unitType. Expected CURRENCY, CRYPTOCURRENCY, or SECURITY.",
      { status: 400 },
    );
  }

  return {
    unitType,
    currency: getOptionalStringField(data, "currency"),
    cryptocurrency: getOptionalStringField(data, "cryptocurrency"),
    symbol: getOptionalStringField(data, "symbol"),
    tradeCurrency: getOptionalStringField(data, "tradeCurrency"),
  };
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

function addCurrencyCacheUnit(
  unitsByKey: Map<string, ValuationCacheUnitRow>,
  currency: string,
) {
  const normalizedCurrency = normalizeUnitCode(currency);
  if (!normalizedCurrency) {
    return;
  }

  const unitKey = `currency:${normalizedCurrency}`;
  unitsByKey.set(unitKey, {
    unitType: "CURRENCY",
    label: normalizedCurrency,
    unitKey,
    currency: normalizedCurrency,
  });
}

function addCryptocurrencyCacheUnit(
  unitsByKey: Map<string, ValuationCacheUnitRow>,
  cryptocurrency: string,
) {
  const normalizedCryptocurrency = normalizeUnitCode(cryptocurrency);
  if (!normalizedCryptocurrency) {
    return;
  }

  const unitKey = `crypto:${normalizedCryptocurrency}`;
  unitsByKey.set(unitKey, {
    unitType: "CRYPTOCURRENCY",
    label: normalizedCryptocurrency,
    unitKey,
    cryptocurrency: normalizedCryptocurrency,
  });
}

function addSecurityCacheUnit(
  unitsByKey: Map<string, ValuationCacheUnitRow>,
  symbol: string,
  tradeCurrency: string,
) {
  const normalizedSymbol = normalizeUnitCode(symbol);
  const normalizedTradeCurrency = normalizeUnitCode(tradeCurrency);
  if (!normalizedSymbol || !normalizedTradeCurrency) {
    return;
  }

  const unitKey = `security:${normalizedSymbol}:${normalizedTradeCurrency}`;
  unitsByKey.set(unitKey, {
    unitType: "SECURITY",
    label: `${normalizedSymbol} (${normalizedTradeCurrency})`,
    unitKey,
    symbol: normalizedSymbol,
    tradeCurrency: normalizedTradeCurrency,
  });
}

function addValuationCacheUnitForRedisKey(args: {
  currencyUnitsByKey: Map<string, ValuationCacheUnitRow>;
  cryptocurrencyUnitsByKey: Map<string, ValuationCacheUnitRow>;
  securityUnitsByKey: Map<string, ValuationCacheUnitRow>;
  key: string;
}) {
  const parts = args.key.split(":");
  if (
    parts.length === 4 &&
    parts[0] === "valuation" &&
    parts[1] === "currencylayer" &&
    parts[2] === BASE_CURRENCY
  ) {
    addCurrencyCacheUnit(args.currencyUnitsByKey, parts[3]);
    return;
  }

  if (
    parts.length === 4 &&
    parts[0] === "valuation" &&
    parts[1] === "coinlayer" &&
    parts[2] === BASE_CURRENCY
  ) {
    addCryptocurrencyCacheUnit(args.cryptocurrencyUnitsByKey, parts[3]);
    return;
  }

  if (
    parts.length === 4 &&
    parts[0] === "valuation" &&
    parts[1] === "marketstack"
  ) {
    addSecurityCacheUnit(args.securityUnitsByKey, parts[2], parts[3]);
  }
}

async function scanValuationCacheUnitKeys(
  redis: NonNullable<Awaited<ReturnType<typeof getRedisClient>>>,
) {
  const keys: string[] = [];
  const patterns = [
    `valuation:currencylayer:${BASE_CURRENCY}:*`,
    `valuation:coinlayer:${BASE_CURRENCY}:*`,
    "valuation:marketstack:*:*",
  ];

  for (const pattern of patterns) {
    for await (const scanResult of redis.scanIterator({
      MATCH: pattern,
      COUNT: 100,
    })) {
      const batch = Array.isArray(scanResult) ? scanResult : [scanResult];
      keys.push(...batch);
    }
  }

  return keys;
}

export const getValuationCacheUnits = createServerFn({ method: "GET" })
  .inputValidator(validateGetValuationCacheUnitsInput)
  .handler(async () => {
    await ensureUser();

    const currencyUnitsByKey = new Map<string, ValuationCacheUnitRow>();
    const cryptocurrencyUnitsByKey = new Map<string, ValuationCacheUnitRow>();
    const securityUnitsByKey = new Map<string, ValuationCacheUnitRow>();

    const redis = await getRedisClient();
    if (redis) {
      try {
        const keys = await scanValuationCacheUnitKeys(redis);
        for (const key of keys) {
          addValuationCacheUnitForRedisKey({
            currencyUnitsByKey,
            cryptocurrencyUnitsByKey,
            securityUnitsByKey,
            key,
          });
        }
      } catch (error) {
        if (!hasWarnedValuationCacheUnitsReadFailure) {
          console.warn("Failed to read valuation cache unit keys.", error);
          hasWarnedValuationCacheUnitsReadFailure = true;
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
    await ensureUser();

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

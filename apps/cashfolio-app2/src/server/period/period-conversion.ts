import { Unit } from "../../.prisma-client/enums";
import {
  getCryptocurrencyToCurrencyExchangeRateDetails,
  getCryptocurrencyToCurrencyExchangeRate,
  getCurrencyExchangeRateDetails,
  getCurrencyExchangeRate,
  getSecurityToCurrencyExchangeRateDetails,
  getSecurityToCurrencyExchangeRate,
} from "../valuation.server";
import { moneyMultiply, moneyIsZero, toMoneyNumber } from "../../shared/money";
import type {
  ValuationRateLookupResult,
  ValuationRateSource,
} from "../valuation/types";

type RateLookupInput = {
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  date: Date;
  referenceCurrency: string;
  exchangeRateByKey: Map<string, Promise<number | null>>;
};

type RateLookupDetailsInput = Omit<RateLookupInput, "exchangeRateByKey"> & {
  exchangeRateByKey: Map<string, Promise<ValuationRateLookupResult>>;
};

export type ReferenceConversionResult = {
  value: number | null;
  source: ValuationRateSource;
};

const ONE_EXCHANGE_RATE_PROMISE: Promise<number | null> = Promise.resolve(1);
const ONE_EXCHANGE_RATE_DETAILS_PROMISE: Promise<ValuationRateLookupResult> =
  Promise.resolve({ rate: 1, source: "identity" });

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getUnitToReferenceExchangeRate(
  args: RateLookupInput,
): Promise<number | null> {
  const { unit, referenceCurrency, exchangeRateByKey } = args;
  const dateKey = toDateKey(args.date);

  if (unit === Unit.CURRENCY) {
    if (!args.currency) return null;
    const sourceCurrency = args.currency.toUpperCase();
    if (sourceCurrency === referenceCurrency) {
      return 1;
    }

    const cacheKey = `currency:${sourceCurrency}:${referenceCurrency}:${dateKey}`;
    const existingPromise = exchangeRateByKey.get(cacheKey);
    const exchangeRatePromise =
      existingPromise ??
      getCurrencyExchangeRate({
        sourceCurrency,
        targetCurrency: referenceCurrency,
        date: args.date,
      });

    if (!existingPromise) {
      exchangeRateByKey.set(cacheKey, exchangeRatePromise);
    }

    return exchangeRatePromise;
  }

  if (unit === Unit.CRYPTOCURRENCY) {
    if (!args.cryptocurrency) return null;

    const cryptocurrency = args.cryptocurrency.toUpperCase();
    const cacheKey = `crypto:${cryptocurrency}:${referenceCurrency}:${dateKey}`;
    const existingPromise = exchangeRateByKey.get(cacheKey);
    const exchangeRatePromise =
      existingPromise ??
      getCryptocurrencyToCurrencyExchangeRate({
        cryptocurrency,
        targetCurrency: referenceCurrency,
        date: args.date,
      });

    if (!existingPromise) {
      exchangeRateByKey.set(cacheKey, exchangeRatePromise);
    }

    return exchangeRatePromise;
  }

  if (!args.symbol || !args.tradeCurrency) return null;

  const symbol = args.symbol.toUpperCase();
  const tradeCurrency = args.tradeCurrency.toUpperCase();
  const cacheKey = `security:${symbol}:${tradeCurrency}:${referenceCurrency}:${dateKey}`;
  const existingPromise = exchangeRateByKey.get(cacheKey);
  const exchangeRatePromise =
    existingPromise ??
    getSecurityToCurrencyExchangeRate({
      symbol,
      tradeCurrency,
      targetCurrency: referenceCurrency,
      date: args.date,
    });

  if (!existingPromise) {
    exchangeRateByKey.set(cacheKey, exchangeRatePromise);
  }

  return exchangeRatePromise;
}

export async function getUnitToReferenceExchangeRateDetails(
  args: RateLookupDetailsInput,
): Promise<ValuationRateLookupResult> {
  const { unit, referenceCurrency, exchangeRateByKey } = args;
  const dateKey = toDateKey(args.date);

  if (unit === Unit.CURRENCY) {
    if (!args.currency) return { rate: null, source: "missing" };
    const sourceCurrency = args.currency.toUpperCase();
    if (sourceCurrency === referenceCurrency) {
      return { rate: 1, source: "identity" };
    }

    const cacheKey = `currency:${sourceCurrency}:${referenceCurrency}:${dateKey}`;
    const existingPromise = exchangeRateByKey.get(cacheKey);
    const exchangeRatePromise =
      existingPromise ??
      getCurrencyExchangeRateDetails({
        sourceCurrency,
        targetCurrency: referenceCurrency,
        date: args.date,
      });

    if (!existingPromise) {
      exchangeRateByKey.set(cacheKey, exchangeRatePromise);
    }

    return exchangeRatePromise;
  }

  if (unit === Unit.CRYPTOCURRENCY) {
    if (!args.cryptocurrency) return { rate: null, source: "missing" };

    const cryptocurrency = args.cryptocurrency.toUpperCase();
    const cacheKey = `crypto:${cryptocurrency}:${referenceCurrency}:${dateKey}`;
    const existingPromise = exchangeRateByKey.get(cacheKey);
    const exchangeRatePromise =
      existingPromise ??
      getCryptocurrencyToCurrencyExchangeRateDetails({
        cryptocurrency,
        targetCurrency: referenceCurrency,
        date: args.date,
      });

    if (!existingPromise) {
      exchangeRateByKey.set(cacheKey, exchangeRatePromise);
    }

    return exchangeRatePromise;
  }

  if (!args.symbol || !args.tradeCurrency) {
    return { rate: null, source: "missing" };
  }

  const symbol = args.symbol.toUpperCase();
  const tradeCurrency = args.tradeCurrency.toUpperCase();
  const cacheKey = `security:${symbol}:${tradeCurrency}:${referenceCurrency}:${dateKey}`;
  const existingPromise = exchangeRateByKey.get(cacheKey);
  const exchangeRatePromise =
    existingPromise ??
    getSecurityToCurrencyExchangeRateDetails({
      symbol,
      tradeCurrency,
      targetCurrency: referenceCurrency,
      date: args.date,
    });

  if (!existingPromise) {
    exchangeRateByKey.set(cacheKey, exchangeRatePromise);
  }

  return exchangeRatePromise;
}

export async function convertBookingValueToReference(args: {
  value: number;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  date: Date;
  referenceCurrency: string;
  exchangeRateByKey: Map<string, Promise<number | null>>;
}): Promise<number | null> {
  if (moneyIsZero(args.value)) {
    return 0;
  }

  const exchangeRatePromise =
    args.unit === Unit.CURRENCY &&
    args.currency?.toUpperCase() === args.referenceCurrency
      ? ONE_EXCHANGE_RATE_PROMISE
      : getUnitToReferenceExchangeRate({
          unit: args.unit,
          currency: args.currency,
          cryptocurrency: args.cryptocurrency,
          symbol: args.symbol,
          tradeCurrency: args.tradeCurrency,
          date: args.date,
          referenceCurrency: args.referenceCurrency,
          exchangeRateByKey: args.exchangeRateByKey,
        });

  const exchangeRate = await exchangeRatePromise;
  if (exchangeRate == null) {
    return null;
  }

  return toMoneyNumber(moneyMultiply(args.value, exchangeRate));
}

export async function convertBookingValueToReferenceDetails(args: {
  value: number;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  date: Date;
  referenceCurrency: string;
  exchangeRateByKey: Map<string, Promise<ValuationRateLookupResult>>;
}): Promise<ReferenceConversionResult> {
  if (moneyIsZero(args.value)) {
    return { value: 0, source: "identity" };
  }

  const exchangeRatePromise =
    args.unit === Unit.CURRENCY &&
    args.currency?.toUpperCase() === args.referenceCurrency
      ? ONE_EXCHANGE_RATE_DETAILS_PROMISE
      : getUnitToReferenceExchangeRateDetails({
          unit: args.unit,
          currency: args.currency,
          cryptocurrency: args.cryptocurrency,
          symbol: args.symbol,
          tradeCurrency: args.tradeCurrency,
          date: args.date,
          referenceCurrency: args.referenceCurrency,
          exchangeRateByKey: args.exchangeRateByKey,
        });

  const exchangeRate = await exchangeRatePromise;
  if (exchangeRate.rate == null) {
    return { value: null, source: exchangeRate.source };
  }

  return {
    value: toMoneyNumber(moneyMultiply(args.value, exchangeRate.rate)),
    source: exchangeRate.source,
  };
}

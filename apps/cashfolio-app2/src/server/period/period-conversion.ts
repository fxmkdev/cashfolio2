import {
  toMoney,
  type Money,
  moneyMultiply,
  moneyIsZero,
} from "../../shared/money";
import { Unit } from "../../.prisma-client/enums";
import {
  getCryptocurrencyToCurrencyExchangeRateDetails,
  getCryptocurrencyToCurrencyExchangeRate,
  getCurrencyExchangeRateDetails,
  getCurrencyExchangeRate,
  getSecurityToCurrencyExchangeRateDetails,
  getSecurityToCurrencyExchangeRate,
} from "../valuation.server";

import type {
  DecimalValuationRateLookupResult as ValuationRateLookupResult,
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
  exchangeRateByKey: Map<string, Promise<Money | null>>;
};

type RateLookupDetailsInput = Omit<RateLookupInput, "exchangeRateByKey"> & {
  exchangeRateByKey: Map<string, Promise<ValuationRateLookupResult>>;
};

export type ReferenceConversionResult = {
  value: Money | null;
  source: ValuationRateSource;
};

const ONE_EXCHANGE_RATE_PROMISE: Promise<Money | null> = Promise.resolve(
  toMoney(1),
);
const ONE_EXCHANGE_RATE_DETAILS_PROMISE: Promise<ValuationRateLookupResult> =
  Promise.resolve({ rate: toMoney(1), source: "identity" });

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getUnitToReferenceExchangeRate(
  args: RateLookupInput,
): Promise<Money | null> {
  const { unit, referenceCurrency, exchangeRateByKey } = args;
  const dateKey = toDateKey(args.date);

  if (unit === Unit.CURRENCY) {
    if (!args.currency) return null;
    const sourceCurrency = args.currency.toUpperCase();
    if (sourceCurrency === referenceCurrency) {
      return toMoney(1);
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
      return { rate: toMoney(1), source: "identity" };
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
  value: Money;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  date: Date;
  referenceCurrency: string;
  exchangeRateByKey: Map<string, Promise<Money | null>>;
}): Promise<Money | null> {
  if (moneyIsZero(args.value)) {
    return toMoney(0);
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

  return moneyMultiply(args.value, exchangeRate);
}

export async function convertBookingValueToReferenceDetails(args: {
  value: Money;
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
    return { value: toMoney(0), source: "identity" };
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
    value: moneyMultiply(args.value, exchangeRate.rate),
    source: exchangeRate.source,
  };
}

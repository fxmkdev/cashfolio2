import { Unit } from "../.prisma-client/enums";
import {
  getCryptocurrencyToCurrencyExchangeRate,
  getCurrencyExchangeRate,
  getSecurityToCurrencyExchangeRate,
} from "./valuation.server";
import { moneyMultiply, moneyIsZero, toMoneyNumber } from "../shared/money";

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

const ONE_EXCHANGE_RATE_PROMISE: Promise<number | null> = Promise.resolve(1);

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

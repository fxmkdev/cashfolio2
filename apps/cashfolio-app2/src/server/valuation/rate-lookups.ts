import {
  combineValuationRateSources,
  createValuationLookupContext,
  type ValuationLookupContext,
} from "./lookup-context";
import {
  getSecurityPrice,
  getSecurityPriceDetails,
  getUsdPerCryptocurrencyRate,
  getUsdPerCryptocurrencyRateDetails,
  getUsdToCurrencyRate,
  getUsdToCurrencyRateDetails,
} from "./source-rates";
import type { ValuationRateLookupResult } from "./types";

async function getCurrencyExchangeRateWithContext(
  args: {
    sourceCurrency: string;
    targetCurrency: string;
    date: Date;
  },
  context: ValuationLookupContext,
): Promise<number | null> {
  const sourceCurrency = args.sourceCurrency.toUpperCase();
  const targetCurrency = args.targetCurrency.toUpperCase();
  if (sourceCurrency === targetCurrency) {
    return 1;
  }

  try {
    const [usdToTargetRate, usdToSourceRate] = await Promise.all([
      getUsdToCurrencyRate(targetCurrency, args.date, context),
      getUsdToCurrencyRate(sourceCurrency, args.date, context),
    ]);
    if (usdToTargetRate == null || usdToSourceRate == null) {
      return null;
    }

    return usdToTargetRate / usdToSourceRate;
  } catch (error) {
    console.error(
      `Unable to retrieve valuation rate for ${sourceCurrency} -> ${targetCurrency}`,
      error,
    );
    return null;
  }
}

async function getCurrencyExchangeRateDetailsWithContext(
  args: {
    sourceCurrency: string;
    targetCurrency: string;
    date: Date;
  },
  context: ValuationLookupContext,
): Promise<ValuationRateLookupResult> {
  const sourceCurrency = args.sourceCurrency.toUpperCase();
  const targetCurrency = args.targetCurrency.toUpperCase();
  if (sourceCurrency === targetCurrency) {
    return { rate: 1, source: "identity" };
  }

  try {
    const [usdToTargetRate, usdToSourceRate] = await Promise.all([
      getUsdToCurrencyRateDetails(targetCurrency, args.date, context),
      getUsdToCurrencyRateDetails(sourceCurrency, args.date, context),
    ]);
    if (usdToTargetRate.rate == null || usdToSourceRate.rate == null) {
      return { rate: null, source: "missing" };
    }

    return {
      rate: usdToTargetRate.rate / usdToSourceRate.rate,
      source: combineValuationRateSources([
        usdToTargetRate.source,
        usdToSourceRate.source,
      ]),
    };
  } catch (error) {
    console.error(
      `Unable to retrieve valuation rate for ${sourceCurrency} -> ${targetCurrency}`,
      error,
    );
    return { rate: null, source: "missing" };
  }
}

export async function getCurrencyExchangeRate(args: {
  sourceCurrency: string;
  targetCurrency: string;
  date: Date;
}): Promise<number | null> {
  const context = createValuationLookupContext();
  return getCurrencyExchangeRateWithContext(args, context);
}

export async function getCurrencyExchangeRateDetails(args: {
  sourceCurrency: string;
  targetCurrency: string;
  date: Date;
}): Promise<ValuationRateLookupResult> {
  const context = createValuationLookupContext();
  return getCurrencyExchangeRateDetailsWithContext(args, context);
}

export async function getCryptocurrencyToCurrencyExchangeRate(args: {
  cryptocurrency: string;
  targetCurrency: string;
  date: Date;
}): Promise<number | null> {
  const cryptocurrency = args.cryptocurrency.toUpperCase();
  const targetCurrency = args.targetCurrency.toUpperCase();
  const context = createValuationLookupContext();

  try {
    const [usdToTargetRate, cryptoToUsdRate] = await Promise.all([
      getUsdToCurrencyRate(targetCurrency, args.date, context),
      getUsdPerCryptocurrencyRate(cryptocurrency, args.date, context),
    ]);
    if (usdToTargetRate == null || cryptoToUsdRate == null) {
      return null;
    }

    return cryptoToUsdRate * usdToTargetRate;
  } catch (error) {
    console.error(
      `Unable to retrieve valuation rate for ${cryptocurrency} -> ${targetCurrency}`,
      error,
    );
    return null;
  }
}

export async function getCryptocurrencyToCurrencyExchangeRateDetails(args: {
  cryptocurrency: string;
  targetCurrency: string;
  date: Date;
}): Promise<ValuationRateLookupResult> {
  const cryptocurrency = args.cryptocurrency.toUpperCase();
  const targetCurrency = args.targetCurrency.toUpperCase();
  const context = createValuationLookupContext();

  try {
    const [usdToTargetRate, cryptoToUsdRate] = await Promise.all([
      getUsdToCurrencyRateDetails(targetCurrency, args.date, context),
      getUsdPerCryptocurrencyRateDetails(cryptocurrency, args.date, context),
    ]);
    if (usdToTargetRate.rate == null || cryptoToUsdRate.rate == null) {
      return { rate: null, source: "missing" };
    }

    return {
      rate: cryptoToUsdRate.rate * usdToTargetRate.rate,
      source: combineValuationRateSources([
        usdToTargetRate.source,
        cryptoToUsdRate.source,
      ]),
    };
  } catch (error) {
    console.error(
      `Unable to retrieve valuation rate for ${cryptocurrency} -> ${targetCurrency}`,
      error,
    );
    return { rate: null, source: "missing" };
  }
}

export async function getSecurityToCurrencyExchangeRate(args: {
  symbol: string;
  tradeCurrency: string;
  targetCurrency: string;
  date: Date;
}): Promise<number | null> {
  const symbol = args.symbol.toUpperCase();
  const tradeCurrency = args.tradeCurrency.toUpperCase();
  const targetCurrency = args.targetCurrency.toUpperCase();
  const context = createValuationLookupContext();

  try {
    const [securityPrice, tradeToTargetRate] = await Promise.all([
      getSecurityPrice(symbol, tradeCurrency, args.date, context),
      getCurrencyExchangeRateWithContext(
        {
          sourceCurrency: tradeCurrency,
          targetCurrency,
          date: args.date,
        },
        context,
      ),
    ]);
    if (securityPrice == null || tradeToTargetRate == null) {
      return null;
    }

    return securityPrice * tradeToTargetRate;
  } catch (error) {
    console.error(
      `Unable to retrieve security exchange rate for ${symbol} (${tradeCurrency} -> ${targetCurrency})`,
      error,
    );
    return null;
  }
}

export async function getSecurityToCurrencyExchangeRateDetails(args: {
  symbol: string;
  tradeCurrency: string;
  targetCurrency: string;
  date: Date;
}): Promise<ValuationRateLookupResult> {
  const symbol = args.symbol.toUpperCase();
  const tradeCurrency = args.tradeCurrency.toUpperCase();
  const targetCurrency = args.targetCurrency.toUpperCase();
  const context = createValuationLookupContext();

  try {
    const [securityPrice, tradeToTargetRate] = await Promise.all([
      getSecurityPriceDetails(symbol, tradeCurrency, args.date, context),
      getCurrencyExchangeRateDetailsWithContext(
        {
          sourceCurrency: tradeCurrency,
          targetCurrency,
          date: args.date,
        },
        context,
      ),
    ]);
    if (securityPrice.rate == null || tradeToTargetRate.rate == null) {
      return { rate: null, source: "missing" };
    }

    return {
      rate: securityPrice.rate * tradeToTargetRate.rate,
      source: combineValuationRateSources([
        securityPrice.source,
        tradeToTargetRate.source,
      ]),
    };
  } catch (error) {
    console.error(
      `Unable to retrieve security exchange rate for ${symbol} (${tradeCurrency} -> ${targetCurrency})`,
      error,
    );
    return { rate: null, source: "missing" };
  }
}

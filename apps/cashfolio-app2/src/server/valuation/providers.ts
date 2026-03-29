import {
  BASE_CURRENCY,
  COINLAYER_TIMEOUT_MS,
  CURRENCYLAYER_TIMEOUT_MS,
  MARKETSTACK_RATE_LIMIT_MAX_RETRIES,
  MARKETSTACK_RATE_LIMIT_RETRY_DELAY_MS,
  MARKETSTACK_TIMEOUT_MS,
} from "./constants";
import { toDayString } from "./date-utils";
import { getProviderApiKey } from "./provider-api-key";
import {
  isNoDataProviderError,
  parseMarketstackEodResponse,
} from "./provider-response-parsers";
import {
  getProviderBaseContext,
  logProviderInfo,
  logProviderWarn,
  toSafeProviderErrorMessage,
  type ProviderLogContext,
} from "./provider-logging";
import type {
  CoinLayerHistoricalResponse,
  CurrencyLayerHistoricalResponse,
  FetchRateResult,
  MarketstackEodResponse,
} from "./types";
import { NO_DATA_FETCH_RESULT } from "./types";

function getCurrencyLayerApiKey(): string | null {
  return getProviderApiKey({
    envVarName: "CURRENCYLAYER_API_KEY",
    missingKeyWarning:
      "CURRENCYLAYER_API_KEY is not set; reference-currency conversion will be unavailable when account currency differs.",
  });
}

function getCoinLayerApiKey(): string | null {
  return getProviderApiKey({
    envVarName: "COINLAYER_API_KEY",
    missingKeyWarning:
      "COINLAYER_API_KEY is not set; cryptocurrency reference conversion will be unavailable.",
  });
}

function getMarketstackApiKey(): string | null {
  return getProviderApiKey({
    envVarName: "MARKETSTACK_API_KEY",
    missingKeyWarning:
      "MARKETSTACK_API_KEY is not set; security reference conversion will be unavailable.",
  });
}

export { isNoDataProviderError, parseMarketstackEodResponse };

export async function fetchUsdToCurrencyRateFromCurrencyLayer(
  targetCurrency: string,
  date: Date,
): Promise<FetchRateResult> {
  const apiKey = getCurrencyLayerApiKey();
  if (!apiKey) return null;

  const requestContext = {
    ...getProviderBaseContext({ provider: "currencylayer", date }),
    sourceCurrency: BASE_CURRENCY,
    targetCurrency,
  } satisfies ProviderLogContext;
  logProviderInfo("Valuation provider request started", requestContext);

  const params = new URLSearchParams({
    access_key: apiKey,
    source: BASE_CURRENCY,
    currencies: targetCurrency,
    date: toDayString(date),
  });
  const url = `https://api.currencylayer.com/historical?${params.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    CURRENCYLAYER_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new Error("Currencylayer request timed out");
      logProviderWarn(timeoutError.message, {
        ...requestContext,
        timeoutMs: CURRENCYLAYER_TIMEOUT_MS,
        outcome: "timeout",
      });
      throw timeoutError;
    }
    logProviderWarn("Valuation provider request failed", {
      ...requestContext,
      outcome: "requestError",
      error: toSafeProviderErrorMessage(error),
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    logProviderWarn("Valuation provider response failed", {
      ...requestContext,
      outcome: "httpError",
      httpStatus: response.status,
      httpStatusText: response.statusText,
    });
    throw new Error(
      `Currencylayer request failed with ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as CurrencyLayerHistoricalResponse;
  if (!data.success) {
    if (isNoDataProviderError(data.error)) {
      logProviderInfo("Valuation provider response received", {
        ...requestContext,
        outcome: "noData",
      });
      return NO_DATA_FETCH_RESULT;
    }

    logProviderWarn("Valuation provider response failed", {
      ...requestContext,
      outcome: "providerError",
      errorInfo: data.error?.info ?? "Unknown error",
    });
    throw new Error(
      `Currencylayer request failed: ${data.error?.info ?? "Unknown error"}`,
    );
  }

  const quote = data.quotes?.[`${BASE_CURRENCY}${targetCurrency}`];
  const hasRate = typeof quote === "number";
  logProviderInfo("Valuation provider response received", {
    ...requestContext,
    outcome: hasRate ? "retrieved" : "missingRate",
  });
  return hasRate ? quote : null;
}

export async function fetchUsdPerCryptocurrencyRateFromCoinLayer(
  cryptocurrency: string,
  date: Date,
): Promise<FetchRateResult> {
  const apiKey = getCoinLayerApiKey();
  if (!apiKey) return null;

  const requestContext = {
    ...getProviderBaseContext({ provider: "coinlayer", date }),
    targetCurrency: BASE_CURRENCY,
    cryptocurrency,
  } satisfies ProviderLogContext;
  logProviderInfo("Valuation provider request started", requestContext);

  const params = new URLSearchParams({
    access_key: apiKey,
    target: BASE_CURRENCY,
    symbols: cryptocurrency,
  });
  const url = `https://api.coinlayer.com/${toDayString(date)}?${params.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COINLAYER_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new Error("Coinlayer request timed out");
      logProviderWarn(timeoutError.message, {
        ...requestContext,
        timeoutMs: COINLAYER_TIMEOUT_MS,
        outcome: "timeout",
      });
      throw timeoutError;
    }
    logProviderWarn("Valuation provider request failed", {
      ...requestContext,
      outcome: "requestError",
      error: toSafeProviderErrorMessage(error),
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    logProviderWarn("Valuation provider response failed", {
      ...requestContext,
      outcome: "httpError",
      httpStatus: response.status,
      httpStatusText: response.statusText,
    });
    throw new Error(
      `Coinlayer request failed with ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as CoinLayerHistoricalResponse;
  if (!data.success) {
    if (isNoDataProviderError(data.error)) {
      logProviderInfo("Valuation provider response received", {
        ...requestContext,
        outcome: "noData",
      });
      return NO_DATA_FETCH_RESULT;
    }

    logProviderWarn("Valuation provider response failed", {
      ...requestContext,
      outcome: "providerError",
      errorInfo: data.error?.info ?? "Unknown error",
    });
    throw new Error(
      `Coinlayer request failed: ${data.error?.info ?? "Unknown error"}`,
    );
  }

  const rate = data.rates?.[cryptocurrency];
  const hasRate = typeof rate === "number";
  logProviderInfo("Valuation provider response received", {
    ...requestContext,
    outcome: hasRate ? "retrieved" : "missingRate",
  });
  return hasRate ? rate : null;
}

export async function fetchSecurityPriceFromMarketstack(
  symbol: string,
  tradeCurrency: string,
  date: Date,
  retryCount = 0,
): Promise<FetchRateResult> {
  const apiKey = getMarketstackApiKey();
  if (!apiKey) return null;

  const requestContext = {
    ...getProviderBaseContext({ provider: "marketstack", date }),
    symbol,
    tradeCurrency,
    retryCount,
  } satisfies ProviderLogContext;
  logProviderInfo("Valuation provider request started", requestContext);

  const params = new URLSearchParams({
    access_key: apiKey,
    symbols: symbol,
  });
  const url = `https://api.marketstack.com/v2/eod/${toDayString(date)}?${params.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MARKETSTACK_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new Error("Marketstack request timed out");
      logProviderWarn(timeoutError.message, {
        ...requestContext,
        timeoutMs: MARKETSTACK_TIMEOUT_MS,
        outcome: "timeout",
      });
      throw timeoutError;
    }
    logProviderWarn("Valuation provider request failed", {
      ...requestContext,
      outcome: "requestError",
      error: toSafeProviderErrorMessage(error),
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (
    response.status === 429 &&
    retryCount < MARKETSTACK_RATE_LIMIT_MAX_RETRIES
  ) {
    logProviderWarn("Valuation provider rate limited; retrying", {
      ...requestContext,
      outcome: "rateLimitRetry",
      httpStatus: response.status,
      nextRetryCount: retryCount + 1,
      maxRetries: MARKETSTACK_RATE_LIMIT_MAX_RETRIES,
    });
    await new Promise((resolve) =>
      setTimeout(resolve, MARKETSTACK_RATE_LIMIT_RETRY_DELAY_MS),
    );
    return fetchSecurityPriceFromMarketstack(
      symbol,
      tradeCurrency,
      date,
      retryCount + 1,
    );
  }

  if (!response.ok) {
    logProviderWarn("Valuation provider response failed", {
      ...requestContext,
      outcome: "httpError",
      httpStatus: response.status,
      httpStatusText: response.statusText,
    });
    throw new Error(
      `Marketstack request failed with ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as MarketstackEodResponse;
  const parsed = parseMarketstackEodResponse({
    response: data,
    symbol,
    tradeCurrency,
    date,
  });
  logProviderInfo("Valuation provider response received", {
    ...requestContext,
    outcome:
      parsed === NO_DATA_FETCH_RESULT
        ? "noData"
        : typeof parsed === "number"
          ? "retrieved"
          : "missingRate",
  });
  return parsed;
}

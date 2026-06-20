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
  sanitizeProviderLogText,
  toSafeProviderErrorMessage,
  type ProviderLogContext,
} from "./provider-logging";
import {
  recordValuationProviderRequest,
  VALUATION_PROVIDER_REQUEST_REASONS,
  type ValuationProviderRequestOutcome,
  type ValuationProviderRequestReason,
} from "./provider-usage";
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
  requestReason: ValuationProviderRequestReason = VALUATION_PROVIDER_REQUEST_REASONS.INITIAL_PROBE,
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
  const requestedAt = new Date();
  const startedAt = Date.now();

  async function recordUsage(args: {
    outcome: ValuationProviderRequestOutcome;
    httpStatus?: number;
    errorMessage?: string;
  }) {
    await recordValuationProviderRequest({
      provider: "CURRENCYLAYER",
      unitType: "CURRENCY",
      outcome: args.outcome,
      requestReason,
      valuationDate: date,
      requestedAt,
      durationMs: Date.now() - startedAt,
      retryCount: 0,
      currency: targetCurrency,
      httpStatus: args.httpStatus,
      errorMessage: args.errorMessage,
    });
  }

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new Error("Currencylayer request timed out");
      await recordUsage({
        outcome: "TIMEOUT",
        errorMessage: timeoutError.message,
      });
      logProviderWarn(timeoutError.message, {
        ...requestContext,
        timeoutMs: CURRENCYLAYER_TIMEOUT_MS,
        outcome: "timeout",
      });
      throw timeoutError;
    }
    await recordUsage({
      outcome: "REQUEST_ERROR",
      errorMessage: toSafeProviderErrorMessage(error),
    });
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
    await recordUsage({
      outcome: "HTTP_ERROR",
      httpStatus: response.status,
      errorMessage: response.statusText,
    });
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

  let data: CurrencyLayerHistoricalResponse;
  try {
    data = (await response.json()) as CurrencyLayerHistoricalResponse;
  } catch (error) {
    await recordUsage({
      outcome: "PROVIDER_ERROR",
      httpStatus: response.status,
      errorMessage: toSafeProviderErrorMessage(error),
    });
    throw error;
  }
  if (!data.success) {
    if (isNoDataProviderError(data.error)) {
      await recordUsage({
        outcome: "NO_DATA",
        httpStatus: response.status,
      });
      logProviderInfo("Valuation provider response received", {
        ...requestContext,
        outcome: "noData",
      });
      return NO_DATA_FETCH_RESULT;
    }

    await recordUsage({
      outcome: "PROVIDER_ERROR",
      httpStatus: response.status,
      errorMessage: data.error?.info ?? "Unknown error",
    });
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
  await recordUsage({
    outcome: hasRate ? "RETRIEVED" : "MISSING_RATE",
    httpStatus: response.status,
  });
  logProviderInfo("Valuation provider response received", {
    ...requestContext,
    outcome: hasRate ? "retrieved" : "missingRate",
  });
  return hasRate ? quote : null;
}

export async function fetchUsdPerCryptocurrencyRateFromCoinLayer(
  cryptocurrency: string,
  date: Date,
  requestReason: ValuationProviderRequestReason = VALUATION_PROVIDER_REQUEST_REASONS.INITIAL_PROBE,
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
  const requestedAt = new Date();
  const startedAt = Date.now();

  async function recordUsage(args: {
    outcome: ValuationProviderRequestOutcome;
    httpStatus?: number;
    errorMessage?: string;
  }) {
    await recordValuationProviderRequest({
      provider: "COINLAYER",
      unitType: "CRYPTOCURRENCY",
      outcome: args.outcome,
      requestReason,
      valuationDate: date,
      requestedAt,
      durationMs: Date.now() - startedAt,
      retryCount: 0,
      cryptocurrency,
      httpStatus: args.httpStatus,
      errorMessage: args.errorMessage,
    });
  }

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new Error("Coinlayer request timed out");
      await recordUsage({
        outcome: "TIMEOUT",
        errorMessage: timeoutError.message,
      });
      logProviderWarn(timeoutError.message, {
        ...requestContext,
        timeoutMs: COINLAYER_TIMEOUT_MS,
        outcome: "timeout",
      });
      throw timeoutError;
    }
    await recordUsage({
      outcome: "REQUEST_ERROR",
      errorMessage: toSafeProviderErrorMessage(error),
    });
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
    await recordUsage({
      outcome: "HTTP_ERROR",
      httpStatus: response.status,
      errorMessage: response.statusText,
    });
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

  let data: CoinLayerHistoricalResponse;
  try {
    data = (await response.json()) as CoinLayerHistoricalResponse;
  } catch (error) {
    await recordUsage({
      outcome: "PROVIDER_ERROR",
      httpStatus: response.status,
      errorMessage: toSafeProviderErrorMessage(error),
    });
    throw error;
  }
  if (!data.success) {
    if (isNoDataProviderError(data.error)) {
      await recordUsage({
        outcome: "NO_DATA",
        httpStatus: response.status,
      });
      logProviderInfo("Valuation provider response received", {
        ...requestContext,
        outcome: "noData",
      });
      return NO_DATA_FETCH_RESULT;
    }

    await recordUsage({
      outcome: "PROVIDER_ERROR",
      httpStatus: response.status,
      errorMessage: data.error?.info ?? "Unknown error",
    });
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
  await recordUsage({
    outcome: hasRate ? "RETRIEVED" : "MISSING_RATE",
    httpStatus: response.status,
  });
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
  requestReason: ValuationProviderRequestReason = VALUATION_PROVIDER_REQUEST_REASONS.INITIAL_PROBE,
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
  const requestedAt = new Date();
  const startedAt = Date.now();

  async function recordUsage(args: {
    outcome: ValuationProviderRequestOutcome;
    httpStatus?: number;
    errorMessage?: string;
  }) {
    await recordValuationProviderRequest({
      provider: "MARKETSTACK",
      unitType: "SECURITY",
      outcome: args.outcome,
      requestReason,
      valuationDate: date,
      requestedAt,
      durationMs: Date.now() - startedAt,
      retryCount,
      symbol,
      tradeCurrency,
      httpStatus: args.httpStatus,
      errorMessage: args.errorMessage,
    });
  }

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new Error("Marketstack request timed out");
      await recordUsage({
        outcome: "TIMEOUT",
        errorMessage: timeoutError.message,
      });
      logProviderWarn(timeoutError.message, {
        ...requestContext,
        timeoutMs: MARKETSTACK_TIMEOUT_MS,
        outcome: "timeout",
      });
      throw timeoutError;
    }
    await recordUsage({
      outcome: "REQUEST_ERROR",
      errorMessage: toSafeProviderErrorMessage(error),
    });
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
    await recordUsage({
      outcome: "RATE_LIMIT_RETRY",
      httpStatus: response.status,
      errorMessage: response.statusText,
    });
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
      VALUATION_PROVIDER_REQUEST_REASONS.RATE_LIMIT_RETRY,
      retryCount + 1,
    );
  }

  if (!response.ok) {
    await recordUsage({
      outcome: "HTTP_ERROR",
      httpStatus: response.status,
      errorMessage: response.statusText,
    });
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

  let parsed: FetchRateResult;
  try {
    const data = (await response.json()) as MarketstackEodResponse;
    parsed = parseMarketstackEodResponse({
      response: data,
      symbol,
      tradeCurrency,
      date,
    });
  } catch (error) {
    await recordUsage({
      outcome: "PROVIDER_ERROR",
      httpStatus: response.status,
      errorMessage: sanitizeProviderLogText(
        error instanceof Error ? error.message : String(error),
      ),
    });
    throw error;
  }
  await recordUsage({
    outcome:
      parsed === NO_DATA_FETCH_RESULT
        ? "NO_DATA"
        : typeof parsed === "number"
          ? "RETRIEVED"
          : "MISSING_RATE",
    httpStatus: response.status,
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

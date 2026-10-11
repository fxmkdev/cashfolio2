import { fetchProviderResponse } from "./request";
import { getProviderApiKey } from "../provider-api-key";
import {
  type ValuationProviderRequestReason,
  VALUATION_PROVIDER_REQUEST_REASONS,
  type ValuationProviderRequestOutcome,
  recordValuationProviderRequest,
} from "../provider-usage";
import {
  type FetchRateResult,
  type MarketstackEodResponse,
  NO_DATA_FETCH_RESULT,
} from "../types";
import {
  getProviderBaseContext,
  type ProviderLogContext,
  logProviderInfo,
  logProviderWarn,
  sanitizeProviderLogText,
} from "../provider-logging";
import { toDayString } from "../date-utils";
import {
  MARKETSTACK_TIMEOUT_MS,
  MARKETSTACK_RATE_LIMIT_MAX_RETRIES,
  MARKETSTACK_RATE_LIMIT_RETRY_DELAY_MS,
} from "../constants";
import { parseMarketstackEodResponse } from "../provider-response-parsers";

function getMarketstackApiKey(): string | null {
  return getProviderApiKey({
    envVarName: "MARKETSTACK_API_KEY",
    missingKeyWarning:
      "MARKETSTACK_API_KEY is not set; security reference conversion will be unavailable.",
  });
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

  const response = await fetchProviderResponse({
    url,
    timeoutMs: MARKETSTACK_TIMEOUT_MS,
    timeoutMessage: "Marketstack request timed out",
    requestContext,
    recordUsage,
  });

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

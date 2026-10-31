import { rethrowResourceError } from "../../resource-error";
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
  type CoinLayerHistoricalResponse,
  NO_DATA_FETCH_RESULT,
} from "../types";
import {
  getProviderBaseContext,
  type ProviderLogContext,
  logProviderInfo,
  logProviderWarn,
  toSafeProviderErrorMessage,
} from "../provider-logging";
import { BASE_CURRENCY, COINLAYER_TIMEOUT_MS } from "../constants";
import { toDayString } from "../date-utils";
import { isNoDataProviderError } from "../provider-response-parsers";

function getCoinLayerApiKey(): Promise<string | null> {
  return getProviderApiKey({
    envVarName: "COINLAYER_API_KEY",
    missingKeyWarning:
      "COINLAYER_API_KEY is not set; cryptocurrency reference conversion will be unavailable.",
  });
}

export async function fetchUsdPerCryptocurrencyRateFromCoinLayer(
  cryptocurrency: string,
  date: Date,
  requestReason: ValuationProviderRequestReason = VALUATION_PROVIDER_REQUEST_REASONS.INITIAL_PROBE,
): Promise<FetchRateResult> {
  const apiKey = await getCoinLayerApiKey();
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

  const response = await fetchProviderResponse({
    url,
    timeoutMs: COINLAYER_TIMEOUT_MS,
    timeoutMessage: "Coinlayer request timed out",
    requestContext,
    recordUsage,
  });

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

  let parsed: FetchRateResult;
  let providerErrorMessage: string | undefined;
  try {
    const data = (await response.json()) as CoinLayerHistoricalResponse;
    if (!data.success) {
      if (isNoDataProviderError(data.error)) {
        parsed = NO_DATA_FETCH_RESULT;
      } else {
        providerErrorMessage = data.error?.info ?? "Unknown error";
        throw new Error(`Coinlayer request failed: ${providerErrorMessage}`);
      }
    } else {
      const rate = data.rates?.[cryptocurrency];
      parsed = typeof rate === "number" ? rate : null;
    }
  } catch (error) {
    rethrowResourceError(error);
    const errorMessage =
      providerErrorMessage ?? toSafeProviderErrorMessage(error);
    await recordUsage({
      outcome: "PROVIDER_ERROR",
      httpStatus: response.status,
      errorMessage,
    });
    logProviderWarn("Valuation provider response failed", {
      ...requestContext,
      outcome: "providerError",
      errorInfo: errorMessage,
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

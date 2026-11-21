import { setTimeout as delay } from "node:timers/promises";
import { parseTickerMetadata, type TickerMetadata } from "./metadata-data";
import {
  HistoryDataError,
  parseHistoryRows,
  historyOmissionDiagnostics,
} from "./history-data.server";
import {
  checkResourceBudget,
  consumeProviderAttempt,
  getResourceSignal,
} from "../resource-context.server";
import { rethrowResourceError } from "../resource-error";
import { getProviderApiKey } from "../valuation/provider-api-key.server";
import {
  recordValuationProviderRequest,
  type RecordValuationProviderRequestInput,
} from "../valuation/provider-usage.server";
import {
  MARKETSTACK_TIMEOUT_MS,
  MARKETSTACK_RATE_LIMIT_MAX_RETRIES,
  MARKETSTACK_RATE_LIMIT_RETRY_DELAY_MS,
} from "../valuation/constants";
export { parseHistoryRows, type HistorySeries } from "./history-data.server";

export type ListingMetadata = {
  symbol: string;
  name: string;
  exchange: string | null;
  mic: string | null;
  country: string | null;
  hasHistory: boolean | null;
};
export type MarketstackPage = {
  data: unknown[];
  pagination: { offset: number; count: number; total: number };
};
export type MarketstackOptions = {
  signal?: AbortSignal;
  record?: (input: RecordValuationProviderRequestInput) => Promise<void>;
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Marketstack returned malformed data.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 255): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > max)
    throw new Error("Marketstack returned malformed metadata.");
  return value.trim() || null;
}
export function parseMarketstackPage(
  raw: unknown,
  offset: number,
): MarketstackPage {
  const root = object(raw);
  const pagination = object(root.pagination);
  if (
    !Array.isArray(root.data) ||
    ![pagination.offset, pagination.count, pagination.total].every(
      (v) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0,
    ) ||
    pagination.offset !== offset ||
    pagination.count !== root.data.length ||
    root.data.length > 1000 ||
    (root.data.length > 0 &&
      (pagination.count as number) + offset > (pagination.total as number))
  )
    throw new Error("Marketstack returned inconsistent pagination.");
  return {
    data: root.data,
    pagination: {
      offset,
      count: pagination.count as number,
      total: pagination.total as number,
    },
  };
}
export function parseListingRow(raw: unknown): ListingMetadata {
  const row = object(raw);
  const rawSymbol = row.ticker ?? row.symbol;
  const symbol = text(rawSymbol, 64) ? (rawSymbol as string) : null;
  if (
    !symbol ||
    symbol.includes(",") ||
    [...symbol].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    throw new Error("Marketstack returned an invalid symbol.");
  const exchange = row.stock_exchange == null ? {} : object(row.stock_exchange);
  const mic = text(exchange.mic, 64) ? (exchange.mic as string) : "";
  if (mic && !/^[A-Za-z0-9._-]{1,64}$/.test(mic))
    throw new Error("Marketstack returned an invalid exchange identifier.");
  if (row.has_eod != null && typeof row.has_eod !== "boolean")
    throw new Error("Marketstack returned invalid availability metadata.");
  const name = text(exchange.name);
  return {
    symbol,
    name: text(row.name) ?? symbol,
    exchange: name,
    mic: mic || null,
    country: text(exchange.country),
    hasHistory: row.has_eod == null ? null : (row.has_eod as boolean),
  };
}
function providerError(raw: unknown, status: number): Error | null {
  const root = object(raw);
  if (!root.error && status < 400) return null;
  const error =
    root.error && typeof root.error === "object"
      ? (root.error as Record<string, unknown>)
      : {};
  const code = String(error.code ?? "");
  if (
    status === 401 ||
    code === "101" ||
    ["invalid_access_key", "unauthorized"].includes(code)
  )
    return new Error("Marketstack credentials are unavailable or invalid.");
  if (status === 403 || ["105", "function_access_restricted"].includes(code))
    return new Error(
      "This Marketstack subscription does not include the requested data.",
    );
  if (
    status === 429 ||
    [
      "104",
      "usage_limit_reached",
      "rate_limit_reached",
      "too_many_requests",
    ].includes(code)
  )
    return new Error(
      "Marketstack request quota or rate limit reached. Try again later.",
    );
  return new Error("Marketstack data could not be retrieved. Try again later.");
}
const TRANSIENT_MAX_RETRIES = 2;

type Decoded<T> = { value: T; usableRows: number; errorMessage?: string };
export function fetchMarketstackPage(
  path: "tickerslist" | "exchanges" | "eod",
  params: Record<string, string>,
  options: MarketstackOptions = {},
): Promise<MarketstackPage> {
  return requestMarketstack(
    path,
    params,
    options,
    (raw) => {
      let errorMessage: string | undefined;
      let page: MarketstackPage;
      try {
        page = parseMarketstackPage(raw, Number(params.offset ?? 0));
      } catch (error) {
        if (path === "eod")
          throw new HistoryDataError(
            "Marketstack returned malformed price pagination.",
          );
        throw error;
      }
      let usableRows = page.data.length;
      if (path === "tickerslist") page.data.forEach(parseListingRow);
      if (
        path === "eod" &&
        params.symbols &&
        params.exchange &&
        params.date_from &&
        params.date_to
      ) {
        const series = parseHistoryRows(
          page.data,
          params.symbols,
          params.exchange,
          params.date_from,
          params.date_to,
        );
        usableRows = series.points.length;
        if (series.omissions.length) {
          const diagnostics = historyOmissionDiagnostics(page.data, series);
          console.warn("Marketstack history observations omitted.", {
            symbol: params.symbols,
            mic: params.exchange,
            ...diagnostics,
          });
          errorMessage = `Unusable closing prices omitted: missing=${diagnostics.counts.missing}, non-positive=${diagnostics.counts["non-positive"]}, invalid=${diagnostics.counts.invalid}.`;
        }
      }
      return { value: page, usableRows, errorMessage };
    },
    path === "eod"
      ? "SECURITY_HISTORY"
      : path === "tickerslist"
        ? "SECURITY_SEARCH"
        : "SECURITY_EXCHANGES",
    params.symbols,
  );
}
export function fetchMarketstackTicker(
  symbol: string,
  mic: string,
  options: MarketstackOptions = {},
): Promise<TickerMetadata> {
  return requestMarketstack(
    `tickers/${encodeURIComponent(symbol)}`,
    {},
    options,
    (raw) => {
      const value = parseTickerMetadata(raw, symbol, mic);
      return { value, usableRows: value.isin ? 1 : 0 };
    },
    "SECURITY_METADATA",
    symbol,
  );
}
async function requestMarketstack<T>(
  path: string,
  params: Record<string, string>,
  options: MarketstackOptions,
  decode: (raw: unknown) => Decoded<T>,
  reason: RecordValuationProviderRequestInput["requestReason"],
  symbol?: string,
): Promise<T> {
  const key = await getProviderApiKey({
    envVarName: "MARKETSTACK_API_KEY",
    missingKeyWarning:
      "MARKETSTACK_API_KEY is not set; Securities provider data is unavailable.",
  });
  if (!key)
    throw new Error("Marketstack is not configured. Contact an administrator.");
  const record = options.record ?? recordValuationProviderRequest;
  let previousRateLimit = false;
  for (let retry = 0; ; retry++) {
    checkResourceBudget();
    options.signal?.throwIfAborted();
    consumeProviderAttempt();
    const requestedAt = new Date();
    const signal = AbortSignal.any([
      AbortSignal.timeout(MARKETSTACK_TIMEOUT_MS),
      ...[getResourceSignal(), options.signal].filter(
        (s): s is AbortSignal => !!s,
      ),
    ]);
    let outcome: RecordValuationProviderRequestInput["outcome"] =
      "REQUEST_ERROR";
    let httpStatus: number | undefined;
    let errorMessage: string | undefined;
    let unreadable = false;
    let rateLimited = false;
    const requestReason = previousRateLimit ? "RATE_LIMIT_RETRY" : reason;
    try {
      const query = new URLSearchParams({ ...params, access_key: key });
      const response = await fetch(
        `https://api.marketstack.com/v2/${path}?${query}`,
        { signal },
      );
      httpStatus = response.status;
      if (httpStatus === 429 && retry < MARKETSTACK_RATE_LIMIT_MAX_RETRIES) {
        outcome = "RATE_LIMIT_RETRY";
        rateLimited = true;
        await response.body?.cancel();
      } else if (httpStatus >= 500) {
        outcome = "HTTP_ERROR";
        errorMessage = "Marketstack is temporarily unavailable.";
        await response.body?.cancel();
        if (retry >= TRANSIENT_MAX_RETRIES)
          throw new Error(
            "Marketstack is temporarily unavailable. Try again later.",
          );
      } else {
        outcome = response.ok ? "PROVIDER_ERROR" : "HTTP_ERROR";
        let raw: unknown;
        try {
          raw = await response.json();
        } catch {
          // A deterministic HTTP error remains terminal even when a proxy or
          // provider sends HTML instead of its usual JSON error envelope.
          if (!response.ok) {
            const failure = providerError({}, response.status);
            if (failure) throw failure;
          }
          unreadable = true;
          throw new Error("Marketstack returned an unreadable response.");
        }
        let root: Record<string, unknown>;
        try {
          root = object(raw);
        } catch (error) {
          if (!response.ok) {
            const failure = providerError({}, response.status);
            if (failure) throw failure;
          }
          if (path === "eod")
            throw new HistoryDataError(
              "Marketstack returned malformed price data.",
            );
          throw error;
        }
        const providerCode =
          root.error && typeof root.error === "object"
            ? String((root.error as Record<string, unknown>).code)
            : "";
        if (
          path === "eod" &&
          ["no_data_found", "data_not_available"].includes(providerCode) &&
          Number(params.offset ?? 0) === 0
        ) {
          outcome = "NO_DATA";
          return decode({
            data: [],
            pagination: { offset: 0, count: 0, total: 0 },
          }).value;
        }
        const error = providerError(raw, response.status);
        if (error) throw error;
        const decoded = decode(raw);
        outcome = decoded.usableRows ? "RETRIEVED" : "NO_DATA";
        errorMessage = decoded.errorMessage;
        return decoded.value;
      }
    } catch (error) {
      errorMessage =
        outcome === "PROVIDER_ERROR"
          ? "Marketstack returned invalid or unsupported data."
          : "Marketstack request failed.";
      rethrowResourceError(error);
      checkResourceBudget();
      if (options.signal?.aborted) throw options.signal.reason;
      if (signal.aborted) {
        outcome = "TIMEOUT";
        errorMessage = "Marketstack request timed out.";
        if (retry >= TRANSIENT_MAX_RETRIES)
          throw new Error("Marketstack request timed out. Try again.", {
            cause: error,
          });
      } else if (unreadable) {
        errorMessage = "Marketstack returned an unreadable response.";
        if (retry >= TRANSIENT_MAX_RETRIES) throw error;
      } else if (outcome === "REQUEST_ERROR") {
        errorMessage = "Marketstack could not be reached.";
        if (retry >= TRANSIENT_MAX_RETRIES)
          throw new Error("Marketstack could not be reached. Try again.", {
            cause: error,
          });
      } else {
        throw error;
      }
    } finally {
      await record({
        provider: "MARKETSTACK",
        unitType: "SECURITY",
        outcome,
        requestReason,
        requestedAt,
        valuationDate: requestedAt,
        durationMs: Date.now() - requestedAt.getTime(),
        retryCount: retry,
        symbol,
        httpStatus,
        errorMessage,
      });
    }
    previousRateLimit = rateLimited;
    await delay(MARKETSTACK_RATE_LIMIT_RETRY_DELAY_MS, undefined, {
      signal: options.signal ?? getResourceSignal(),
    });
  }
}

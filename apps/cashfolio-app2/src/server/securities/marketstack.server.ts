import { setTimeout as delay } from "node:timers/promises";
import { Temporal } from "../../shared/temporal";
import {
  getExchangeLabel,
  type PricePoint,
} from "../../shared/securities/contracts";
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

export type CatalogueRow = {
  symbol: string;
  name: string;
  exchange: string | null;
  mic: string;
  exchangeLabel: string;
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
    (pagination.count as number) + offset > (pagination.total as number)
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
export function parseCatalogueRow(raw: unknown): CatalogueRow {
  const row = object(raw);
  const symbol = text(row.ticker ?? row.symbol, 64);
  if (!symbol || /[,\s]/.test(symbol))
    throw new Error("Marketstack returned an invalid symbol.");
  const exchange = row.stock_exchange == null ? {} : object(row.stock_exchange);
  const mic = text(exchange.mic, 4)?.toUpperCase() ?? "";
  if (mic && !/^[A-Z0-9]{4}$/.test(mic))
    throw new Error("Marketstack returned an invalid exchange MIC.");
  if (row.has_eod != null && typeof row.has_eod !== "boolean")
    throw new Error("Marketstack returned invalid availability metadata.");
  const name = text(exchange.name);
  return {
    symbol,
    name: text(row.name) ?? symbol,
    exchange: name,
    mic,
    exchangeLabel: getExchangeLabel({ exchange: name, mic: mic || null }),
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
export async function fetchMarketstackPage(
  path: "tickerslist" | "exchanges" | "eod",
  params: Record<string, string>,
  options: MarketstackOptions = {},
): Promise<MarketstackPage> {
  const key = await getProviderApiKey({
    envVarName: "MARKETSTACK_API_KEY",
    missingKeyWarning:
      "MARKETSTACK_API_KEY is not set; Securities provider data is unavailable.",
  });
  if (!key)
    throw new Error("Marketstack is not configured. Contact an administrator.");
  const record = options.record ?? recordValuationProviderRequest;
  for (let retry = 0; ; retry++) {
    checkResourceBudget();
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
    try {
      const query = new URLSearchParams({ ...params, access_key: key });
      const response = await fetch(
        `https://api.marketstack.com/v2/${path}?${query}`,
        { signal },
      );
      httpStatus = response.status;
      if (httpStatus === 429 && retry < MARKETSTACK_RATE_LIMIT_MAX_RETRIES) {
        outcome = "RATE_LIMIT_RETRY";
        await response.body?.cancel();
      } else {
        outcome = response.ok ? "PROVIDER_ERROR" : "HTTP_ERROR";
        let raw: unknown;
        try {
          raw = await response.json();
        } catch {
          throw new Error("Marketstack returned an unreadable response.");
        }
        const root = object(raw);
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
          return { data: [], pagination: { offset: 0, count: 0, total: 0 } };
        }
        const error = providerError(raw, response.status);
        if (error) throw error;
        const page = parseMarketstackPage(raw, Number(params.offset ?? 0));
        if (path === "tickerslist") page.data.forEach(parseCatalogueRow);
        if (
          path === "eod" &&
          params.symbols &&
          params.exchange &&
          params.date_from &&
          params.date_to
        )
          parseHistoryRows(
            page.data,
            params.symbols,
            params.exchange,
            params.date_from,
            params.date_to,
          );
        outcome = page.data.length ? "RETRIEVED" : "NO_DATA";
        return page;
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
        throw new Error("Marketstack request timed out. Try again.", {
          cause: error,
        });
      }
      if (outcome === "REQUEST_ERROR")
        throw new Error("Marketstack could not be reached. Try again.", {
          cause: error,
        });
      throw error;
    } finally {
      await record({
        provider: "MARKETSTACK",
        unitType: "SECURITY",
        outcome,
        requestReason: retry
          ? "RATE_LIMIT_RETRY"
          : path === "eod"
            ? "SECURITY_HISTORY"
            : "CATALOGUE_REFRESH",
        requestedAt,
        valuationDate: requestedAt,
        durationMs: Date.now() - requestedAt.getTime(),
        retryCount: retry,
        symbol: params.symbols,
        httpStatus,
        errorMessage,
      });
    }
    await delay(MARKETSTACK_RATE_LIMIT_RETRY_DELAY_MS, undefined, {
      signal: options.signal ?? getResourceSignal(),
    });
  }
}
export type HistorySeries = {
  points: PricePoint[];
  currency: string | null;
  securityType: string | null;
};
export function parseHistoryRows(
  raw: unknown[],
  symbol: string,
  mic: string,
  from: string,
  through: string,
): HistorySeries {
  const points = new Map<string, number>();
  const currencies = new Set<string>();
  const types = new Set<string>();
  for (const value of raw) {
    const row = object(value);
    if (row.symbol !== symbol || (mic && row.exchange !== mic))
      throw new Error("Marketstack returned prices for a different listing.");
    const date = text(row.date, 64)?.slice(0, 10);
    if (
      !date ||
      Temporal.PlainDate.from(date).toString() !== date ||
      date < from ||
      date > through
    )
      throw new Error("Marketstack returned an invalid price date.");
    if (row.close == null) continue;
    if (
      typeof row.close !== "number" ||
      !Number.isFinite(row.close) ||
      row.close <= 0
    )
      throw new Error("Marketstack returned an invalid closing price.");
    if (points.has(date))
      throw new Error("Marketstack returned duplicate price dates.");
    points.set(date, row.close);
    const currency = text(row.price_currency, 64);
    if (currency)
      currencies.add(
        /^[a-z]{3}$/.test(currency) ? currency.toUpperCase() : currency,
      );
    const type = text(row.asset_type);
    if (type) types.add(type);
  }
  if (currencies.size > 1)
    throw new Error(
      "Price history contains incompatible quote currencies or units.",
    );
  return {
    points: [...points]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, close]) => ({ date, close })),
    currency: [...currencies][0] ?? null,
    securityType: types.size === 1 ? [...types][0]! : null,
  };
}

/** Exchange metadata is loaded once per refresh, never once per listing. */
export async function fetchExchangeCountries(
  options: MarketstackOptions,
): Promise<Map<string, string>> {
  const countries = new Map<string, string>();
  let offset = 0;
  let total: number | undefined;
  do {
    const page = await fetchMarketstackPage(
      "exchanges",
      { limit: "1000", offset: String(offset) },
      options,
    );
    if (
      (total !== undefined && page.pagination.total !== total) ||
      (!page.data.length && offset < page.pagination.total)
    )
      throw new Error("Marketstack returned incomplete exchange metadata.");
    total ??= page.pagination.total;
    for (const value of page.data) {
      const row = object(value);
      const mic = text(row.mic, 4);
      const country = text(row.country) ?? text(row.country_code, 3);
      if (mic && country) countries.set(mic, country);
    }
    offset += page.data.length;
  } while (offset < total);
  return countries;
}

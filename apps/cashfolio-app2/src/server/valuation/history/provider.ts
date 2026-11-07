import { getProviderApiKey } from "../provider-api-key";
import { fetchProviderResponse } from "../providers/request";
import { recordValuationProviderRequest } from "../provider-usage";
import {
  parseMarketstackEodResponse,
  isNoDataProviderError,
} from "../provider-response-parsers";
import { Temporal } from "../../../shared/temporal";
import type { ValuationProviderRequestOutcome } from "../provider-usage";
import { checkResourceBudget } from "../../resource-context.server";
import { HistoryFeatureUnavailable, type HistoryTask } from "./types";

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const day = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error("Invalid history date.");
  return Temporal.PlainDate.from(value.slice(0, 10)).toString();
};
export type HistoryBatch = {
  points: Record<string, { date: string; value: number }[]>;
  complete: boolean;
  noData?: boolean;
  unavailable?: Record<string, string[]>;
};
const restricted = (error: unknown) =>
  object(error) &&
  [105, "function_access_restricted", "plan_restriction"].includes(
    error.code as number | string,
  );

/** A range becomes coverage only after every response page is validated. */
export async function fetchHistory(task: HistoryTask): Promise<HistoryBatch> {
  const first = task.series[0]!;
  const provider = first.provider;
  const apiKey = await getProviderApiKey({
    envVarName: `${provider}_API_KEY`,
    missingKeyWarning: `${provider}_API_KEY is not set; historical prices are unavailable.`,
  });
  if (!apiKey)
    throw new Error("A historical price provider is not configured.");
  const points = Object.fromEntries(
    task.series.map((s) => [s.key, [] as { date: string; value: number }[]]),
  );
  const unavailable: Record<string, string[]> = {};
  let offset = 0;
  let expectedTotal: number | undefined;
  for (let page = 0; page < 100; page++) {
    checkResourceBudget();
    const params = new URLSearchParams({ access_key: apiKey });
    const codes = [...new Set(task.series.map((s) => s.code))].join(",");
    let url: string;
    if (provider === "MARKETSTACK") {
      params.set("symbols", codes);
      params.set("limit", "1000");
      params.set("offset", String(offset));
      params.set("sort", "ASC");
      if (task.mode === "range") {
        params.set("date_from", task.from);
        params.set("date_to", task.to);
      }
      url = `https://api.marketstack.com/v2/eod${task.mode === "day" ? `/${task.from}` : ""}?${params}`;
    } else {
      if (provider === "CURRENCYLAYER") {
        params.set("source", "USD");
        params.set("currencies", codes);
      } else {
        params.set("target", "USD");
        params.set("symbols", codes);
      }
      if (task.mode === "range") {
        params.set("start_date", task.from);
        params.set("end_date", task.to);
      } else if (provider === "CURRENCYLAYER") params.set("date", task.from);
      const path =
        task.mode === "range"
          ? "timeframe"
          : provider === "CURRENCYLAYER"
            ? "historical"
            : task.from;
      url = `https://api.${provider.toLowerCase()}.com/${path}?${params}`;
    }
    const requestedAt = new Date();
    const started = Date.now();
    const record = async (args: {
      outcome: ValuationProviderRequestOutcome;
      httpStatus?: number;
      errorMessage?: string;
    }) =>
      recordValuationProviderRequest({
        provider,
        unitType:
          provider === "MARKETSTACK"
            ? "SECURITY"
            : provider === "COINLAYER"
              ? "CRYPTOCURRENCY"
              : "CURRENCY",
        ...args,
        requestReason: "INITIAL_PROBE",
        requestedAt,
        valuationDate: new Date(`${task.from}T00:00:00Z`),
        durationMs: Date.now() - started,
        ...(provider === "MARKETSTACK"
          ? { symbol: codes, tradeCurrency: first.currency }
          : provider === "COINLAYER"
            ? { cryptocurrency: codes }
            : { currency: codes }),
      });
    const response = await fetchProviderResponse({
      url,
      timeoutMs: 10_000,
      timeoutMessage: "Historical price request timed out.",
      requestContext: {
        provider: provider.toLowerCase() as
          "marketstack" | "currencylayer" | "coinlayer",
        date: task.from,
      },
      recordUsage: record,
    });
    const body: unknown = await response.json();
    if (object(body) && restricted(body.error) && task.mode === "range") {
      await record({
        outcome: "PROVIDER_ERROR",
        httpStatus: response.status,
        errorMessage:
          "History range endpoint is not included in the current provider plan.",
      });
      throw new HistoryFeatureUnavailable(
        "History range endpoint is not available on the current plan.",
      );
    }
    if (
      response.ok &&
      object(body) &&
      object(body.error) &&
      isNoDataProviderError({
        code: typeof body.error.code === "number" ? body.error.code : undefined,
        info:
          typeof body.error.info === "string"
            ? body.error.info
            : typeof body.error.message === "string"
              ? body.error.message
              : undefined,
      })
    ) {
      await record({ outcome: "NO_DATA", httpStatus: response.status });
      return { points, complete: true, noData: provider !== "MARKETSTACK" };
    }
    if (!response.ok || !object(body) || body.error || body.success === false) {
      await record({
        outcome: "HTTP_ERROR",
        httpStatus: response.status,
        errorMessage: "Historical price provider rejected the request.",
      });
      throw new Error(`Historical price provider failed (${response.status}).`);
    }
    if (provider === "MARKETSTACK") {
      if (!Array.isArray(body.data))
        throw new Error("Invalid stock history response.");
      const pagination = body.pagination;
      if (
        task.mode === "range" &&
        (!object(pagination) ||
          !Number.isSafeInteger(pagination.total) ||
          !Number.isSafeInteger(pagination.count) ||
          pagination.offset !== offset ||
          pagination.count !== body.data.length)
      )
        throw new Error("Invalid stock history pagination.");
      if (object(pagination)) {
        if (
          typeof pagination.total !== "number" ||
          pagination.total < offset + body.data.length ||
          (expectedTotal !== undefined && pagination.total !== expectedTotal)
        )
          throw new Error("Inconsistent stock history pagination.");
        expectedTotal = pagination.total;
      }
      const seen = new Set<string>();
      for (const item of body.data) {
        if (!object(item) || typeof item.symbol !== "string")
          throw new Error("Invalid stock history point.");
        const date = day(item.date);
        if (date < task.from || date > task.to)
          throw new Error("Stock history is outside the requested range.");
        const targets = task.series.filter((s) => s.code === item.symbol);
        if (!targets.length)
          throw new Error("Unexpected stock history symbol.");
        for (const target of targets) {
          const key = `${target.key}:${date}`;
          if (seen.has(key) || points[target.key]!.some((p) => p.date === date))
            throw new Error("Duplicate stock history point.");
          seen.add(key);
          if (
            typeof item.price_currency === "string" &&
            item.price_currency.trim().toUpperCase() !== target.currency
          )
            throw new Error("Stock history currency is invalid.");
          if (item.close === null) {
            (unavailable[target.key] ??= []).push(date);
            continue;
          }
          const value = parseMarketstackEodResponse({
            response: { data: [item] },
            symbol: target.code,
            tradeCurrency: target.currency,
            date: new Date(`${date}T00:00:00Z`),
          });
          if (typeof value !== "number")
            throw new Error("Stock history currency or price is invalid.");
          points[target.key]!.push({ date, value });
        }
      }
      await record({
        outcome: body.data.length ? "RETRIEVED" : "NO_DATA",
        httpStatus: response.status,
      });
      if (
        object(pagination) &&
        typeof pagination.total === "number" &&
        offset + body.data.length < pagination.total
      ) {
        if (!body.data.length)
          throw new Error("Stock history pagination made no progress.");
        offset += body.data.length;
        continue;
      }
    } else {
      const metadata = provider === "CURRENCYLAYER" ? body.source : body.target;
      if (metadata !== undefined && metadata !== "USD")
        throw new Error("History response has an unexpected base currency.");
      const values = provider === "CURRENCYLAYER" ? body.quotes : body.rates;
      if (!object(values))
        throw new Error("Invalid historical rates response.");
      if (
        task.mode === "range" &&
        (body.timeframe !== true ||
          body.start_date !== task.from ||
          body.end_date !== task.to)
      )
        throw new Error("Incomplete historical timeframe metadata.");
      const entries =
        task.mode === "day"
          ? [[task.from, values] as const]
          : Object.entries(values);
      const dates = new Set<string>();
      for (const [dateValue, row] of entries) {
        const date = day(dateValue);
        if (date < task.from || date > task.to || !object(row))
          throw new Error("Invalid historical rate day.");
        dates.add(date);
        for (const target of task.series) {
          const value =
            row[
              provider === "CURRENCYLAYER" ? `USD${target.code}` : target.code
            ];
          if (value === undefined || value === null)
            throw new Error("Incomplete historical symbol coverage.");
          if (
            typeof value !== "number" ||
            !Number.isFinite(value) ||
            value <= 0
          )
            throw new Error("Invalid historical price.");
          points[target.key]!.push({ date, value });
        }
      }
      const expected =
        Temporal.PlainDate.from(task.from).until(
          Temporal.PlainDate.from(task.to),
          { largestUnit: "day" },
        ).days + 1;
      if (dates.size !== expected)
        throw new Error("Incomplete historical date coverage.");
      await record({ outcome: "RETRIEVED", httpStatus: response.status });
    }
    return {
      points,
      complete: true,
      ...(Object.keys(unavailable).length ? { unavailable } : {}),
    };
  }
  throw new Error("Historical price pagination exceeded the supported limit.");
}

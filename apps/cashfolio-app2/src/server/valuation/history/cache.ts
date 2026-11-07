import { getRedisClient } from "../../../redis.server";
import { VALUATION_SERIES_RETENTION_MS } from "../constants";
import { checkResourceBudget } from "../../resource-context.server";
import { rethrowResourceError } from "../../resource-error";
import type { HistorySeries, HistorySnapshot, HistoryCoverage } from "./types";

export const historyCoverageKey = (key: string) =>
  `valuation:coverage:v1:${key}`;
export const HISTORY_COVERAGE_MS = 24 * 60 * 60 * 1000;
const MAX_LOCAL_BYTES = 32 * 1024 * 1024;
const local = new Map<string, { data: HistorySnapshot; expires: number }>();
let warned = false;
const warn = (error: unknown) => {
  rethrowResourceError(error);
  if (!warned) {
    console.warn(
      "Historical-series cache unavailable; using bounded local data.",
    );
    warned = true;
  }
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function coverageFrom(raw: string | null): HistoryCoverage[] {
  if (!raw || raw.length > 256 * 1024) return [];
  const value: unknown = JSON.parse(raw);
  return Array.isArray(value)
    ? value.filter(
        (v): v is HistoryCoverage =>
          record(v) &&
          typeof v.from === "number" &&
          typeof v.to === "number" &&
          typeof v.publication === "number" &&
          Number.isFinite(v.publication) &&
          typeof v.expiresAt === "number" &&
          Number.isFinite(v.expiresAt) &&
          Number.isFinite(v.from) &&
          Number.isFinite(v.to) &&
          v.from <= v.to &&
          v.to <= v.publication &&
          (v.noData === undefined || typeof v.noData === "boolean") &&
          v.expiresAt > Date.now(),
      )
    : [];
}
/** Operational clearing must remove both prices and their coverage proofs. */
export async function clearHistorySeries(series: HistorySeries) {
  local.delete(series.key);
  const redis = await getRedisClient();
  if (redis) await redis.del([series.key, historyCoverageKey(series.key)]);
}
function prune() {
  let bytes = 0;
  for (const [key, entry] of local) {
    if (entry.expires <= Date.now()) local.delete(key);
    else
      bytes += entry.data.points.length * 40 + entry.data.coverage.length * 64;
  }
  while (local.size > 64 || bytes > MAX_LOCAL_BYTES) {
    const key = local.keys().next().value;
    if (!key) break;
    const entry = local.get(key)!;
    bytes -= entry.data.points.length * 40 + entry.data.coverage.length * 64;
    local.delete(key);
  }
}

/** One range, one predecessor and one coverage read per raw series, not per date. */
export async function readHistorySeries(
  series: HistorySeries,
  from: number,
  to: number,
): Promise<HistorySnapshot> {
  prune();
  const memory = local.get(series.key)?.data;
  let data: HistorySnapshot = { points: [], coverage: [] };
  const redis = await getRedisClient();
  if (redis)
    try {
      const [points, previous, coverage] = await Promise.all([
        redis.ts.range(series.key, from, to).catch((error) => {
          if (
            error instanceof Error &&
            /does not exist|doesn't exist|not exist|no such key/i.test(
              error.message,
            )
          )
            return [];
          throw error;
        }),
        redis.ts
          .revRange(series.key, "-", from - 1, { COUNT: 1 })
          .catch((error) => {
            if (
              error instanceof Error &&
              /does not exist|doesn't exist|not exist|no such key/i.test(
                error.message,
              )
            )
              return [];
            throw error;
          }),
        redis.get(historyCoverageKey(series.key)),
      ]);
      data = {
        points: [...previous, ...points],
        coverage: coverageFrom(coverage),
      };
    } catch (error) {
      warn(error);
    }
  const byTime = new Map(
    [
      ...(memory?.points ?? []).filter(
        (p) => !p.validUntil || p.validUntil > Date.now(),
      ),
      ...data.points,
    ].map((p) => [p.timestamp, p]),
  );
  return {
    points: [...byTime.values()]
      .filter((p) => p.timestamp <= to)
      .sort((a, b) => a.timestamp - b.timestamp),
    coverage: [...data.coverage, ...(memory?.coverage ?? [])].filter(
      (c) => c.expiresAt > Date.now(),
    ),
  };
}

const appendCoverageScript = `
local entries={}
local old=redis.call('GET',KEYS[1])
if old then local ok,value=pcall(cjson.decode,old); if ok and type(value)=='table' then for _,v in ipairs(value) do if v.expiresAt>tonumber(ARGV[1]) then table.insert(entries,v) end end end end
local addition=cjson.decode(ARGV[2]);table.insert(entries,addition)
if #entries>4096 then return redis.error_reply('History coverage limit exceeded') end
redis.call('SET',KEYS[1],cjson.encode(entries),'PX',ARGV[3]);return 1`;

/** Cache writes must finish before recording complete coverage. */
export async function storeHistorySeries(
  series: HistorySeries,
  points: { date: string; value: number }[],
  coverage?: HistoryCoverage,
): Promise<void> {
  const entries = points.map((p) => ({
    timestamp: Date.parse(`${p.date}T00:00:00Z`),
    value: p.value,
    validUntil: Date.now() + 15 * 60 * 1000,
  }));
  const old = local.get(series.key)?.data ?? { points: [], coverage: [] };
  const merged = new Map(
    [...old.points, ...entries].map((p) => [p.timestamp, p]),
  );
  local.delete(series.key);
  local.set(series.key, {
    data: {
      points: [...merged.values()].sort((a, b) => a.timestamp - b.timestamp),
      coverage: [
        ...old.coverage.filter((c) => c.expiresAt > Date.now()),
        ...(coverage
          ? [
              {
                ...coverage,
                expiresAt: Math.min(
                  coverage.expiresAt,
                  Date.now() + 15 * 60 * 1000,
                ),
              },
            ]
          : []),
      ],
    },
    expires: Date.now() + 15 * 60 * 1000,
  });
  prune();
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    for (let offset = 0; offset < entries.length; offset += 256) {
      checkResourceBudget();
      // Node Redis auto-pipelines commands submitted in the same event-loop tick.
      await Promise.all(
        entries.slice(offset, offset + 256).map((p) =>
          redis.ts.add(series.key, p.timestamp, p.value, {
            ON_DUPLICATE: "LAST",
            RETENTION: VALUATION_SERIES_RETENTION_MS,
          }),
        ),
      );
    }
    if (coverage)
      await redis.eval(appendCoverageScript, {
        keys: [historyCoverageKey(series.key)],
        arguments: [
          String(Date.now()),
          JSON.stringify(coverage),
          String(Math.max(1, coverage.expiresAt - Date.now())),
        ],
      });
  } catch (error) {
    warn(error);
  }
}

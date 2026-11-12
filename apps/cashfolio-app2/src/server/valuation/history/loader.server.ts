import { Temporal } from "../../../shared/temporal";
import { toMoney } from "../../../shared/money";
import { checkResourceBudget } from "../../resource-context.server";
import { rethrowResourceError } from "../../resource-error";
import { combineValuationRateSources } from "../lookup-context";
import { fetchHistory } from "./provider.server";
import {
  readHistorySeries,
  storeHistorySeries,
  HISTORY_COVERAGE_MS,
} from "./cache.server";
import { historyCapability } from "./capability.server";
import { coveredUntil, resolveHistoricalRate } from "./resolve";
import {
  HistoryPending,
  HistoryFeatureUnavailable,
  seriesFor,
  type HistoryRequest,
  type HistorySeries,
  type HistorySnapshot,
  type HistoryTask,
  type HistoryFailure,
  type HistoryRate,
} from "./types";

const timestamp = (date: string) => Date.parse(`${date}T00:00:00Z`);
const day = (date: number) => new Date(date).toISOString().slice(0, 10);
const add = (date: string, days: number) =>
  Temporal.PlainDate.from(date).add({ days }).toString();
const taskKey = (task: HistoryTask) =>
  JSON.stringify([
    task.series.map((s) => s.key),
    task.from,
    task.to,
    task.mode,
  ]);
export async function createHistoricalLoader(
  requests: HistoryRequest[],
  referenceCurrency: string,
  publication: string,
  failures: Record<string, HistoryFailure>,
) {
  const cutoff = timestamp(publication);
  const units = new Map<string, { series: HistorySeries; days: Set<number> }>();
  for (const request of requests)
    for (const series of seriesFor(request, referenceCurrency)) {
      const unit = units.get(series.key) ?? { series, days: new Set<number>() };
      unit.days.add(
        Math.min(timestamp(request.date.toISOString().slice(0, 10)), cutoff),
      );
      units.set(series.key, unit);
    }
  const snapshots = new Map<string, HistorySnapshot>();
  await Promise.all(
    [...units.values()].map(async (u) => {
      const dates = [...u.days];
      snapshots.set(
        u.series.key,
        await readHistorySeries(
          u.series,
          timestamp(add(day(Math.min(...dates)), -30)),
          Math.max(...dates),
        ),
      );
    }),
  );
  const capabilities = new Map(
    await Promise.all(
      [...new Set([...units.values()].map((u) => u.series.provider))].map(
        async (p) => [p, await historyCapability(p)] as const,
      ),
    ),
  );
  const raw = (series: HistorySeries, date: number) =>
    resolveHistoricalRate(snapshots.get(series.key)!, date, cutoff);
  const resolved = new Map<string, HistoryRate>();
  const lookup = async (request: HistoryRequest): Promise<HistoryRate> => {
    const key = JSON.stringify(request);
    const cached = resolved.get(key);
    if (cached) return cached;
    if (
      request.unit === "CURRENCY" &&
      request.currency?.toUpperCase() === referenceCurrency
    )
      return { rate: toMoney(1), source: "identity", validUntil: Infinity };
    const date = timestamp(request.date.toISOString().slice(0, 10));
    const series = seriesFor(request, referenceCurrency);
    const values = series.map((s) => {
      const result = raw(s, date);
      if (!result) throw new HistoryPending("Historical prices are pending.");
      return result;
    });
    const find = (provider: HistorySeries["provider"], code: string | null) => {
      if (provider === "CURRENCYLAYER" && code?.toUpperCase() === "USD")
        return toMoney(1);
      const index = series.findIndex(
        (s) => s.provider === provider && s.code === code?.toUpperCase(),
      );
      return index < 0 ? null : values[index]!.rate;
    };
    const target = find("CURRENCYLAYER", referenceCurrency);
    const source =
      request.unit === "CURRENCY"
        ? find("CURRENCYLAYER", request.currency)
        : request.unit === "CRYPTOCURRENCY"
          ? find("COINLAYER", request.cryptocurrency)
          : find("MARKETSTACK", request.symbol);
    const trade =
      request.unit === "SECURITY"
        ? find("CURRENCYLAYER", request.tradeCurrency)
        : toMoney(1);
    const rate =
      !target || !source || !trade || source.isZero() || trade.isZero()
        ? null
        : request.unit === "CURRENCY"
          ? target.div(source)
          : source.mul(target).div(trade);
    const result = {
      rate,
      source:
        rate === null
          ? ("missing" as const)
          : combineValuationRateSources(values.map((v) => v.source)),
      validUntil: Math.min(...values.map((v) => v.validUntil)),
    };
    resolved.set(key, result);
    return result;
  };
  function tasks(): HistoryTask[] {
    const result = new Map<string, HistoryTask>();
    for (const { series, days } of units.values()) {
      const capability = capabilities.get(series.provider)!;
      for (const date of days) {
        if (raw(series, date)) continue;
        let from: string;
        let to: string;
        const singleDay = Object.entries(failures).some(([key, value]) => {
          if (!value.preferDay) return false;
          const [keys, from, to] = JSON.parse(key) as [
            string[],
            string,
            string,
          ];
          return (
            keys.includes(series.key) &&
            date >= timestamp(from) &&
            date <= timestamp(to)
          );
        });
        const mode =
          capability.supported === false || singleDay ? "day" : "range";
        if (mode === "day") {
          // The requested date may already be confirmed empty. Advance the
          // backtracking probe rather than downloading that empty day forever.
          const snapshot = snapshots.get(series.key)!;
          let probe = date;
          for (let offset = 0; offset <= 30; offset++) {
            probe = timestamp(add(day(date), -offset));
            if (
              !snapshot.points.some((p) => p.timestamp === probe) &&
              !coveredUntil(
                snapshot.coverage.filter((c) => c.publication === cutoff),
                probe,
                probe,
              )
            )
              break;
          }
          from = to = day(probe);
        } else {
          const min = add(day(Math.min(...days)), -30);
          const offset = Temporal.PlainDate.from(min).until(
            Temporal.PlainDate.from(day(date)),
            { largestUnit: "day" },
          ).days;
          from = add(min, Math.floor(offset / 365) * 365);
          to = day(
            Math.min(timestamp(add(from, 364)), cutoff, Math.max(...days)),
          );
        }
        const key = JSON.stringify([
          series.provider,
          series.currency,
          from,
          to,
          mode,
        ]);
        const entry = result.get(key) ?? { series: [], from, to, mode };
        if (!entry.series.some((s) => s.key === series.key))
          entry.series.push(series);
        result.set(key, entry);
      }
    }
    // Canonical order also gives concurrent tabs the same failure/backoff keys.
    const list = [...result.values()].map((t) => ({
      ...t,
      series: t.series.sort((a, b) => a.key.localeCompare(b.key)),
    }));
    const probing = new Set<string>();
    return list.filter((t) => {
      if (capabilities.get(t.series[0]!.provider)!.supported !== undefined)
        return true;
      if (probing.has(t.series[0]!.provider)) return false;
      probing.add(t.series[0]!.provider);
      return true;
    });
  }
  return {
    lookup,
    pending: () => tasks().length,
    async pump(limit = 4) {
      resolved.clear();
      const selected = tasks()
        .filter(
          (t) =>
            !failures[taskKey(t)] ||
            failures[taskKey(t)]!.retryAt <= Date.now(),
        )
        .slice(0, Math.min(4, limit));
      const settled = await Promise.allSettled(
        selected.map(async (task) => {
          checkResourceBudget();
          const key = taskKey(task);
          const failure = failures[key];
          if (failure && failure.attempts >= 3)
            throw new Error(
              "Historical prices could not be loaded. Please try again.",
            );
          try {
            const batch = await fetchHistory(task);
            if (!batch.complete)
              throw new Error(
                "Historical provider returned an incomplete range.",
              );
            const coverage = {
              from: timestamp(task.from),
              to: timestamp(task.to),
              publication: cutoff,
              expiresAt:
                Date.now() +
                (batch.noData ? 60 * 60 * 1000 : HISTORY_COVERAGE_MS),
              ...(batch.noData ? { noData: true } : {}),
            };
            await Promise.all(
              task.series.map(async (s) => {
                const unavailable = new Set(batch.unavailable?.[s.key] ?? []);
                const points = batch.points[s.key]!.filter(
                  (p) =>
                    !snapshots
                      .get(s.key)!
                      .points.some(
                        (old) => old.timestamp === timestamp(p.date),
                      ),
                );
                await storeHistorySeries(s, points);
                // Nullable range closes never prove a gap. Check those days
                // individually, retaining the existing one-hour miss cooldown.
                let from = task.from;
                for (const date of [...unavailable].sort()) {
                  if (date > from)
                    await storeHistorySeries(s, [], {
                      ...coverage,
                      from: timestamp(from),
                      to: timestamp(add(date, -1)),
                    });
                  from = add(date, 1);
                  if (task.mode === "day")
                    await storeHistorySeries(s, [], {
                      ...coverage,
                      from: timestamp(date),
                      to: timestamp(date),
                      expiresAt: Date.now() + 3600_000,
                      temporary: true,
                    });
                }
                if (from <= task.to)
                  await storeHistorySeries(s, [], {
                    ...coverage,
                    from: timestamp(from),
                  });
              }),
            );
            if (task.mode === "range") {
              await capabilities.get(task.series[0]!.provider)!.set(true);
              capabilities.get(task.series[0]!.provider)!.supported = true;
            }
            if (
              task.mode === "range" &&
              batch.unavailable &&
              Object.keys(batch.unavailable).length
            )
              failures[key] = { attempts: 0, retryAt: 0, preferDay: true };
            else delete failures[key];
            await Promise.all(
              task.series.map(async (s) => {
                const u = units.get(s.key)!;
                snapshots.set(
                  s.key,
                  await readHistorySeries(
                    s,
                    timestamp(add(day(Math.min(...u.days)), -30)),
                    Math.max(...u.days),
                  ),
                );
              }),
            );
          } catch (error) {
            rethrowResourceError(error);
            if (error instanceof HistoryFeatureUnavailable) {
              await capabilities.get(task.series[0]!.provider)!.set(false);
              capabilities.get(task.series[0]!.provider)!.supported = false;
              return;
            }
            failures[key] = {
              attempts: (failure?.attempts ?? 0) + 1,
              retryAt: Date.now() + 1000,
            };
            if (failures[key]!.attempts >= 3) throw error;
          }
        }),
      );
      for (const result of settled)
        if (result.status === "rejected") throw result.reason;
      return selected.length;
    },
  };
}

import type { PrismaClient } from "../../.prisma-client/client";
import { Temporal } from "../../shared/temporal";
import type { SecurityHistory } from "../../shared/securities/contracts";
import { getRedisClient } from "../../redis.server";
import {
  createUserScopedSharedWork,
  startReadBudget,
  checkResourceBudget,
} from "../resource-context.server";
import {
  fetchMarketstackPage,
  parseHistoryRows,
  type HistorySeries,
} from "./marketstack.server";
import { listingResponse, readSnapshot } from "./store.server";

async function loadSeries(
  symbol: string,
  mic: string,
  from: string,
  through: string,
): Promise<HistorySeries> {
  const key = `securities:marketstack:history:v1:${encodeURIComponent(JSON.stringify([symbol, mic, from, through]))}`;
  let redis: Awaited<ReturnType<typeof getRedisClient>> = null;
  try {
    redis = await getRedisClient();
    const cached = await redis?.get(key);
    if (cached) {
      const value = JSON.parse(cached) as HistorySeries;
      if (!Array.isArray(value.points) || !value.points.length)
        throw new Error("Invalid cached price history.");
      // Reuse strict provider validation at the untrusted cache boundary.
      const series = parseHistoryRows(
        value.points.map((p) => ({
          ...p,
          date: p.date,
          close: p.close,
          symbol,
          exchange: mic,
          price_currency: value.currency,
          asset_type: value.securityType,
        })),
        symbol,
        mic,
        from,
        through,
      );
      return series;
    }
  } catch {
    /* A corrupt/unavailable cache must not prevent a live lookup. */
  }
  const raw: unknown[] = [];
  let total: number | undefined;
  do {
    checkResourceBudget();
    const page = await fetchMarketstackPage("eod", {
      symbols: symbol,
      ...(mic ? { exchange: mic } : {}),
      date_from: from,
      date_to: through,
      sort: "ASC",
      limit: "1000",
      offset: String(raw.length),
    });
    if (total !== undefined && page.pagination.total !== total)
      throw new Error(
        "Marketstack price history changed during loading. Try again.",
      );
    total ??= page.pagination.total;
    if (!page.data.length && raw.length < total)
      throw new Error("Marketstack returned incomplete price history.");
    raw.push(...page.data);
    if (raw.length > 5000)
      throw new Error(
        "Marketstack returned too many daily prices for this listing.",
      );
  } while (raw.length < total);
  const series = parseHistoryRows(raw, symbol, mic, from, through);
  if (series.points.length) {
    try {
      await redis?.set(key, JSON.stringify(series), { EX: 24 * 60 * 60 });
    } catch {
      /* Best-effort reference-data cache. */
    }
  }
  return series;
}
const sharedHistory = createUserScopedSharedWork<HistorySeries>();
export async function securityHistory(
  db: PrismaClient,
  input: { version: string; id: string },
): Promise<SecurityHistory> {
  startReadBudget();
  await readSnapshot(db, input.version);
  const row = await db.securityCatalogueListing.findFirst({
    where: { id: input.id, snapshotId: input.version },
  });
  if (!row)
    throw new Error("This listing is no longer available. Search again.");
  const through = Temporal.Now.plainDateISO("UTC").toString();
  const from = Temporal.PlainDate.from(through)
    .subtract({ years: 5 })
    .toString();
  if (row.hasHistory === false)
    return { listing: listingResponse(row), points: [], from, through };
  if (!row.mic)
    throw new Error(
      "Price history cannot be matched safely because this listing has no exchange MIC.",
    );
  const series = await sharedHistory(
    JSON.stringify([row.symbol, row.mic, from, through]),
    () => loadSeries(row.symbol, row.mic, from, through),
  );
  return {
    listing: {
      ...listingResponse(row),
      currency: series.currency,
      securityType: series.securityType,
    },
    points: series.points,
    from,
    through,
  };
}

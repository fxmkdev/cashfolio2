import type { PrismaClient } from "../../.prisma-client/client";
import { Temporal } from "../../shared/temporal";
import type { SecurityHistory } from "../../shared/securities/contracts";
import { getRedisClient } from "../../redis.server";
import {
  createUserScopedSharedWork,
  startReadBudget,
  checkResourceBudget,
} from "../resource-context.server";
import { fetchMarketstackPage, parseHistoryRows } from "./marketstack.server";
import { listingResponse, readSnapshot } from "./store.server";
import { HistoryDataError } from "./history-data.server";
import {
  historyCacheKey,
  readCachedHistory,
  unavailableHistory,
  HISTORY_COOLDOWN_SECONDS,
  type HistoryResult,
} from "./history-cache.server";

async function loadSeries(
  symbol: string,
  mic: string,
  from: string,
  through: string,
): Promise<HistoryResult> {
  const key = historyCacheKey(symbol, mic, from, through);
  let redis: Awaited<ReturnType<typeof getRedisClient>> = null;
  try {
    redis = await getRedisClient();
    const cached = await redis?.get(key);
    if (cached) return readCachedHistory(cached, symbol, mic, from, through);
  } catch {
    /* A corrupt/unavailable cache must not prevent a live lookup. */
  }
  let result: HistoryResult;
  try {
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
        throw new HistoryDataError(
          "Marketstack price history changed during loading. Try again.",
        );
      total ??= page.pagination.total;
      if (!page.data.length && raw.length < total)
        throw new HistoryDataError(
          "Marketstack returned incomplete price history.",
        );
      raw.push(...page.data);
      if (raw.length > 5000)
        throw new HistoryDataError(
          "Marketstack returned too many daily prices for this listing.",
        );
    } while (raw.length < total);
    const series = parseHistoryRows(raw, symbol, mic, from, through);
    result = series.points.length
      ? { ...series, status: "ready" }
      : unavailableHistory(
          series.omissions.length ? "no-usable-prices" : "no-data",
          series,
        );
  } catch (error) {
    if (!(error instanceof HistoryDataError)) throw error;
    checkResourceBudget();
    console.warn("Marketstack history validation failed.", {
      symbol,
      mic,
      message: error.message,
    });
    result = unavailableHistory("invalid-data");
  }
  try {
    checkResourceBudget();
    await redis?.set(key, JSON.stringify(result), {
      EX: result.status === "ready" ? 24 * 60 * 60 : HISTORY_COOLDOWN_SECONDS,
    });
  } catch {
    /* Best-effort reference-data cache. */
  }
  checkResourceBudget();
  return result;
}
const sharedHistory = createUserScopedSharedWork<HistoryResult>();
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
    return {
      listing: listingResponse(row),
      status: "ready",
      points: [],
      omissions: [],
      from,
      through,
    };
  if (!row.mic)
    throw new Error(
      "Price history cannot be matched safely because this listing has no exchange MIC.",
    );
  const series = await sharedHistory(
    JSON.stringify([row.symbol, row.mic, from, through]),
    () => loadSeries(row.symbol, row.mic, from, through),
  );
  const { currency, securityType, ...history } = series;
  return {
    ...history,
    listing: {
      ...listingResponse(row),
      currency,
      securityType,
    },
    from,
    through,
  };
}

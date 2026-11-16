import { setTimeout as delay } from "node:timers/promises";
import { createId } from "@paralleldrive/cuid2";
import type { PrismaClient } from "../.prisma-client/client";
import {
  fetchMarketstackPage,
  parseCatalogueRow,
  type MarketstackPage,
  type MarketstackOptions,
} from "../server/securities/marketstack.server";

export const REFRESH_TIMEOUT_MS = 30 * 60 * 1000;
export const CATALOGUE_LOCK = 903504;
export type CatalogueFetcher = (
  offset: number,
  signal: AbortSignal,
) => Promise<MarketstackPage>;
export type RefreshSummary = {
  status: "completed" | "skipped";
  rows: number;
  pages: number;
  version: string | null;
  reason?: "catalogue-present" | "refresh-locked";
};
export async function refreshCatalogue(
  db: PrismaClient,
  options: MarketstackOptions & {
    onlyIfMissing?: boolean;
    prepare?: (signal: AbortSignal) => Promise<ReadonlyMap<string, string>>;
    fetchPage?: CatalogueFetcher;
    now?: () => Date;
    exchangeCountries?: ReadonlyMap<string, string>;
  } = {},
): Promise<RefreshSummary> {
  const deadline = Date.now() + REFRESH_TIMEOUT_MS;
  const signal = AbortSignal.any([
    AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    ...(options.signal ? [options.signal] : []),
  ]);
  const fetchPage =
    options.fetchPage ??
    ((offset, signal) =>
      fetchMarketstackPage(
        "tickerslist",
        { offset: String(offset), limit: "1000" },
        { ...options, signal },
      ));
  const now = options.now ?? (() => new Date());
  async function existingCatalogue(): Promise<RefreshSummary | null> {
    if (!options.onlyIfMissing) return null;
    signal.throwIfAborted();
    const snapshot = await db.securityCatalogueSnapshot.findFirst({
      where: { publishedAt: { not: null }, expiresAt: null },
      orderBy: { publishedAt: "desc" },
    });
    return snapshot
      ? {
          status: "skipped",
          reason: "catalogue-present",
          rows: snapshot.rowCount,
          pages: 0,
          version: snapshot.id,
        }
      : null;
  }
  const existing = await existingCatalogue();
  if (existing) return existing;
  // The lock transaction reserves one connection; staged batch writes use the
  // second. No HTTP request can acquire or trigger this maintenance lock.
  while (true) {
    signal.throwIfAborted();
    const summary = await db.$transaction(
      async (lock): Promise<RefreshSummary> => {
        const [result] = await lock.$queryRaw<
          { locked: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(${CATALOGUE_LOCK}) AS locked`;
        if (!result?.locked)
          return {
            status: "skipped",
            reason: "refresh-locked",
            rows: 0,
            pages: 0,
            version: null,
          };
        const existing = await existingCatalogue();
        if (existing) return existing;
        const countries =
          (await options.prepare?.(signal)) ?? options.exchangeCountries;
        signal.throwIfAborted();
        const version = createId();
        let rows = 0;
        let pages = 0;
        try {
          signal.throwIfAborted();
          await db.securityCatalogueSnapshot.create({ data: { id: version } });
          let total: number | undefined;
          const seen = new Set<string>();
          do {
            signal.throwIfAborted();
            // Keep the lock connection active throughout the paginated HTTP work.
            // Losing the transaction must stop staging before publication.
            await lock.$queryRaw`SELECT 1`;
            const page = await fetchPage(rows, signal);
            if (
              page.pagination.offset !== rows ||
              page.pagination.count !== page.data.length ||
              page.pagination.total < rows + page.data.length ||
              !page.data.length ||
              (total !== undefined && page.pagination.total !== total)
            )
              throw new Error(
                "The Marketstack catalogue changed or pagination was incomplete. Retry the refresh.",
              );
            total ??= page.pagination.total;
            const batch = page.data.map((raw) => {
              const row = parseCatalogueRow(raw);
              const key = JSON.stringify([row.symbol, row.mic]);
              if (seen.has(key))
                throw new Error(
                  "Marketstack returned duplicate catalogue listings.",
                );
              seen.add(key);
              return {
                ...row,
                country: row.country ?? countries?.get(row.mic) ?? null,
                id: createId(),
                snapshotId: version,
              };
            });
            await db.securityCatalogueListing.createMany({ data: batch });
            rows += batch.length;
            pages++;
            if (pages % 10 === 0)
              console.info("SECURITIES_REFRESH", {
                status: "running",
                rows,
                pages,
              });
          } while (rows < total);
          signal.throwIfAborted();
          await lock.$queryRaw`SELECT 1`;
          await db.$transaction(async (tx) => {
            const previous = await tx.securityCatalogueSnapshot.findFirst({
              where: { publishedAt: { not: null }, expiresAt: null },
              orderBy: { publishedAt: "desc" },
            });
            const publishedAt = new Date(
              Math.max(
                now().getTime(),
                (previous?.publishedAt?.getTime() ?? 0) + 1,
              ),
            );
            await tx.securityCatalogueSnapshot.updateMany({
              where: { publishedAt: { not: null }, expiresAt: null },
              data: {
                expiresAt: new Date(
                  publishedAt.getTime() + 48 * 60 * 60 * 1000,
                ),
              },
            });
            await tx.securityCatalogueSnapshot.update({
              where: { id: version },
              data: { publishedAt, rowCount: rows },
            });
            await tx.securityCatalogueSnapshot.deleteMany({
              where: {
                OR: [
                  { expiresAt: { lte: publishedAt } },
                  {
                    publishedAt: null,
                    createdAt: {
                      lt: new Date(publishedAt.getTime() - 24 * 60 * 60 * 1000),
                    },
                  },
                ],
              },
            });
          });
          return { status: "completed", version, rows, pages };
        } catch (error) {
          await db.securityCatalogueSnapshot
            .deleteMany({ where: { id: version, publishedAt: null } })
            .catch(() => {});
          throw error;
        }
      },
      { maxWait: 1000, timeout: Math.max(1, deadline - Date.now()) + 5000 },
    );
    if (!options.onlyIfMissing || summary.reason !== "refresh-locked")
      return summary;
    // Initialization cannot succeed while another job has only staged data.
    await delay(2000, undefined, { signal });
    const existing = await existingCatalogue();
    if (existing) return existing;
  }
}

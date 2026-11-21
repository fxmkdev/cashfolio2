import { getRedisClient } from "../../redis.server";
import type {
  SecuritiesExchanges,
  SecuritiesPage,
  SecuritiesQuery,
} from "../../shared/securities/contracts";
import {
  checkResourceBudget,
  createUserScopedSharedWork,
} from "../resource-context.server";
import {
  fetchMarketstackPage,
  parseListingRow,
  type ListingMetadata,
} from "./marketstack.server";
import { issueListing, readListingMetadata } from "./selection.server";

type ListingPage = { rows: ListingMetadata[]; totalCount: number };
const sharedPages = createUserScopedSharedWork<ListingPage>();
const sharedExchanges = createUserScopedSharedWork<SecuritiesExchanges>();
async function cached<T>(
  key: string,
  ttl: number,
  read: (value: unknown) => T,
  load: () => Promise<T>,
): Promise<T> {
  let redis: Awaited<ReturnType<typeof getRedisClient>> = null;
  try {
    redis = await getRedisClient();
    const value = await redis?.get(key);
    if (value) {
      const result = read(JSON.parse(value));
      checkResourceBudget();
      return result;
    }
  } catch {
    /* Invalid/unavailable caches retain bounded provider fallback. */
  }
  checkResourceBudget();
  const result = await load();
  try {
    checkResourceBudget();
    await redis?.set(key, JSON.stringify(result), { EX: ttl });
  } catch {
    /* Best-effort public reference-data cache. */
  }
  checkResourceBudget();
  return result;
}
export async function searchListings(
  input: SecuritiesQuery,
): Promise<SecuritiesPage> {
  const { criteria, offset, limit } = input;
  const key = `securities:marketstack:search:v1:${encodeURIComponent(JSON.stringify([criteria.query, criteria.exchange, limit, offset]))}`;
  function readPage(value: unknown): ListingPage {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(
        "Marketstack returned malformed listing data. Try again.",
      );
    const page = value as Record<string, unknown>;
    if (
      !Array.isArray(page.rows) ||
      page.rows.length > limit ||
      !Number.isSafeInteger(page.totalCount) ||
      (page.totalCount as number) < 0 ||
      page.rows.length !==
        Math.min(limit, Math.max(0, (page.totalCount as number) - offset)) ||
      (page.rows.length &&
        offset + page.rows.length > (page.totalCount as number))
    )
      throw new Error(
        "Marketstack returned inconsistent listing pagination. Try again.",
      );
    const rows = page.rows.map(readListingMetadata);
    if (
      new Set(rows.map((row) => JSON.stringify([row.symbol, row.mic]))).size !==
      rows.length
    )
      throw new Error("Marketstack returned duplicate listing identities.");
    if (criteria.exchange && rows.some((row) => row.mic !== criteria.exchange))
      throw new Error(
        "Marketstack returned a different exchange listing. Try again.",
      );
    return { rows, totalCount: page.totalCount as number };
  }
  const page = await sharedPages(key, () =>
    cached(key, 86400, readPage, async () => {
      const response = await fetchMarketstackPage("tickerslist", {
        ...(criteria.query ? { search: criteria.query } : {}),
        ...(criteria.exchange ? { exchange: criteria.exchange } : {}),
        limit: String(limit),
        offset: String(offset),
      });
      // A page is never replenished or reordered using other provider pages.
      return readPage({
        rows: response.data.map(parseListingRow),
        totalCount: response.pagination.total,
      });
    }),
  );
  return { rows: page.rows.map(issueListing), totalCount: page.totalCount };
}
function readExchanges(value: unknown): SecuritiesExchanges {
  if (!Array.isArray(value) || !value.length || value.length > 10000)
    throw new Error("Invalid exchange directory.");
  const seen = new Set<string>();
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new Error("Invalid exchange.");
    const row = entry as Record<string, unknown>;
    if (
      typeof row.value !== "string" ||
      !/^[A-Za-z0-9._-]{1,64}$/.test(row.value) ||
      seen.has(row.value) ||
      typeof row.label !== "string" ||
      !row.label.trim() ||
      row.label.length > 400
    )
      throw new Error("Invalid exchange.");
    seen.add(row.value);
    return { value: row.value, label: row.label };
  });
}
export async function exchangeDirectory(): Promise<SecuritiesExchanges> {
  const key = "securities:marketstack:exchanges:v1";
  return sharedExchanges(key, () =>
    cached(key, 7 * 86400, readExchanges, async () => {
      const rows: SecuritiesExchanges = [];
      let offset = 0;
      let total: number | undefined;
      do {
        checkResourceBudget();
        const page = await fetchMarketstackPage("exchanges", {
          limit: "1000",
          offset: String(offset),
        });
        if (
          (total !== undefined && total !== page.pagination.total) ||
          page.pagination.total > 10000 ||
          (!page.data.length && offset < page.pagination.total)
        )
          throw new Error("Marketstack returned incomplete exchange metadata.");
        total ??= page.pagination.total;
        for (const value of page.data) {
          if (!value || typeof value !== "object" || Array.isArray(value))
            throw new Error("Marketstack returned invalid exchange metadata.");
          const row = value as Record<string, unknown>;
          if (
            typeof row.name !== "string" ||
            !row.name.trim() ||
            row.name.length > 255 ||
            typeof row.mic !== "string"
          )
            throw new Error("Marketstack returned invalid exchange metadata.");
          rows.push({ value: row.mic, label: `${row.name} (${row.mic})` });
        }
        offset += page.data.length;
      } while (offset < total);
      return readExchanges(rows);
    }),
  );
}

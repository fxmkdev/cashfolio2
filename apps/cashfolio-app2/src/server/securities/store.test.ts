import { beforeEach, expect, test, vi } from "vitest";
import type { PrismaClient } from "../../.prisma-client/client";
import {
  catalogueStatus,
  filterOptions,
  readSnapshot,
  searchCatalogue,
} from "./store.server";
const snapshot = vi.fn(),
  groupBy = vi.fn(),
  findMany = vi.fn(),
  count = vi.fn();
const transaction = vi.fn(async (work: Promise<unknown>[]) =>
  Promise.all(work),
);
const db = {
  securityCatalogueSnapshot: { findFirst: snapshot },
  securityCatalogueListing: { groupBy, findMany, count },
  $transaction: transaction,
} as unknown as PrismaClient;
const scope = { version: "v", criteria: { query: "", exchange: null } };
beforeEach(() => {
  vi.clearAllMocks();
  snapshot.mockResolvedValue({
    id: "v",
    publishedAt: new Date(Date.now() - 49 * 60 * 60 * 1000),
  });
});
test("distinguishes missing, stale and expired catalogues", async () => {
  snapshot.mockResolvedValueOnce(null);
  expect(await catalogueStatus(db)).toEqual({
    version: null,
    updatedAt: null,
    stale: false,
    exchanges: [],
  });
  groupBy.mockResolvedValueOnce([
    { mic: "XNAS", exchangeLabel: "NASDAQ (XNAS)" },
    { mic: "XNAS", exchangeLabel: "NASDAQ All (XNAS)" },
  ]);
  expect(await catalogueStatus(db)).toMatchObject({
    version: "v",
    stale: true,
    exchanges: [{ value: "XNAS", label: "NASDAQ All (XNAS)" }],
  });
  snapshot.mockResolvedValueOnce(null);
  await expect(readSnapshot(db, "expired")).rejects.toThrow("updated");
});
test("query facets use the submitted scope, including unknown availability and countries", async () => {
  groupBy
    .mockResolvedValueOnce([{ exchangeLabel: "Unknown" }])
    .mockResolvedValueOnce([{ country: null }, { country: "US" }])
    .mockResolvedValueOnce([
      { hasHistory: null },
      { hasHistory: false },
      { hasHistory: true },
    ]);
  expect(await filterOptions(db, scope)).toEqual({
    exchange: ["Unknown"],
    country: ["Unknown", "US"],
    hasHistory: ["Unknown", "Unavailable", "Available"],
  });
  expect(groupBy).toHaveBeenCalledWith(
    expect.objectContaining({ where: { snapshotId: "v" } }),
  );
});
test("queries immutable rows with stable ordering and separate filtered/submitted counts", async () => {
  findMany.mockResolvedValueOnce([
    {
      id: "listing",
      name: "ABC",
      symbol: "ABC",
      mic: "",
      country: null,
      exchange: null,
      hasHistory: null,
    },
  ]);
  count.mockResolvedValueOnce(21).mockResolvedValueOnce(90);
  const page = await searchCatalogue(db, {
    ...scope,
    offset: 20,
    limit: 20,
    filters: { exchange: ["Unknown"] },
    sorts: [{ field: "exchange", direction: "desc" }],
  });
  expect(page).toMatchObject({
    version: "v",
    filteredCount: 21,
    totalCount: 90,
    rows: [{ mic: null, currency: null, securityType: null }],
  });
  expect(findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      skip: 20,
      take: 20,
      orderBy: [
        { exchangeLabel: "desc" },
        { symbol: "asc" },
        { mic: "asc" },
        { id: "asc" },
      ],
    }),
  );
});

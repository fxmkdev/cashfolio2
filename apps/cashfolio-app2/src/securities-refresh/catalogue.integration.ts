import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { PrismaClient } from "../.prisma-client/client";
import {
  catalogueStatus,
  filterOptions,
  readSnapshot,
  searchCatalogue,
} from "../server/securities/store.server";
import {
  CATALOGUE_LOCK,
  refreshCatalogue,
  type CatalogueFetcher,
} from "./refresh.server";
const execute = promisify(execFile);
const maintenance = new URL(
  process.env.MUTATION_TEST_ADMIN_DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5433/postgres",
);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(maintenance.hostname) ||
  maintenance.pathname !== "/postgres"
)
  throw new Error(
    "Securities integration tests require a local maintenance database.",
  );
const databaseName = `securities_test_${randomUUID().replaceAll("-", "")}`;
const url = new URL(maintenance);
url.pathname = `/${databaseName}`;
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: maintenance.href }),
});
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.href, max: 4 }),
});
let created = false;
const now = new Date("2026-11-16T04:17:00Z");
const sample = (
  ticker: string,
  mic = "XNAS",
  has_eod: boolean | null = true,
) => ({
  ticker,
  name: `Sample ${ticker}`,
  has_eod,
  stock_exchange: { name: mic === "XNAS" ? "NASDAQ" : "Swiss", mic },
});
const page: CatalogueFetcher = async (offset) => ({
  data: [
    sample("ABC"),
    sample("ABC", "XSWX"),
    sample("UNKNOWN", "XNAS", null),
  ].slice(offset),
  pagination: { offset, count: 3 - offset, total: 3 },
});
describe("versioned Securities catalogue in PostgreSQL", () => {
  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    created = true;
    await execute("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: url.href },
      maxBuffer: 4 * 1024 * 1024,
    });
  }, 60000);
  beforeEach(async () => {
    await db.securityCatalogueSnapshot.deleteMany();
  });
  afterAll(async () => {
    await db.$disconnect();
    try {
      if (created)
        await admin.$executeRawUnsafe(
          `DROP DATABASE "${databaseName}" WITH (FORCE)`,
        );
    } finally {
      await admin.$disconnect();
    }
  });
  test("initializes an empty catalogue once and skips subsequent/stale initialization without provider calls", async () => {
    const prepare = vi.fn(async () => new Map<string, string>());
    const fetchPage = vi.fn(page);
    const first = await refreshCatalogue(db, {
      onlyIfMissing: true,
      prepare,
      fetchPage,
    });
    expect(first).toMatchObject({ status: "completed", rows: 3 });
    expect(prepare).toHaveBeenCalledTimes(1);
    await db.securityCatalogueSnapshot.update({
      where: { id: first.version! },
      data: { publishedAt: new Date(0) },
    });
    prepare.mockClear();
    fetchPage.mockClear();
    const second = await refreshCatalogue(db, {
      onlyIfMissing: true,
      prepare,
      fetchPage,
    });
    expect(second).toMatchObject({
      status: "skipped",
      reason: "catalogue-present",
      version: first.version,
      rows: 3,
    });
    expect(prepare).not.toHaveBeenCalled();
    expect(fetchPage).not.toHaveBeenCalled();
    expect(await db.securityCatalogueSnapshot.count()).toBe(1);
  });
  test("concurrent initialization publishes once and waits for a usable catalogue", async () => {
    let release!: () => void;
    let ready!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const firstPrepare = vi.fn(async () => {
      ready();
      await gate;
      return new Map<string, string>();
    });
    const secondPrepare = vi.fn(async () => new Map<string, string>());
    const first = refreshCatalogue(db, {
      onlyIfMissing: true,
      prepare: firstPrepare,
      fetchPage: page,
    });
    await pending;
    let finished = false;
    const second = refreshCatalogue(db, {
      onlyIfMissing: true,
      prepare: secondPrepare,
      fetchPage: page,
    }).then((value) => {
      finished = true;
      return value;
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(finished).toBe(false);
    } finally {
      release();
    }
    const [published, skipped] = await Promise.all([first, second]);
    expect(published.status).toBe("completed");
    expect(skipped).toMatchObject({
      reason: "catalogue-present",
      version: published.version,
    });
    expect(secondPrepare).not.toHaveBeenCalled();
    expect(await db.securityCatalogueSnapshot.count()).toBe(1);
  });
  test("failed initialization never leaves a partial or usable catalogue", async () => {
    await expect(
      refreshCatalogue(db, {
        onlyIfMissing: true,
        fetchPage: async () => {
          throw new Error("provider failed");
        },
      }),
    ).rejects.toThrow("provider failed");
    expect(await db.securityCatalogueSnapshot.count()).toBe(0);
    expect((await catalogueStatus(db)).version).toBeNull();
  });
  test("prefetches while an insert is blocked and binds provider metadata as data", async () => {
    let release!: () => void;
    let ready!: () => void;
    let fetched!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const prefetched = new Promise<void>((resolve) => {
      fetched = resolve;
    });
    const holding = db.$transaction(
      async (tx) => {
        await tx.$executeRaw`LOCK TABLE "SecurityCatalogueListing" IN SHARE MODE`;
        ready();
        await gate;
      },
      { timeout: 10000 },
    );
    await locked;
    const refresh = refreshCatalogue(db, {
      fetchPage: async (offset) => {
        if (offset === 1) fetched();
        return {
          data: [
            {
              ticker: offset ? "NEE 6.219" : "O'NEIL",
              name: 'A "quoted" name; --',
              has_eod: offset ? false : null,
              stock_exchange: { mic: "XETRA", name: "Provider's Exchange" },
            },
          ],
          pagination: { offset, count: 1, total: 2 },
        };
      },
    });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        prefetched,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  "Next page was not prefetched during the blocked write.",
                ),
              ),
            2000,
          );
        }),
      ]);
      expect((await catalogueStatus(db)).version).toBeNull();
    } finally {
      clearTimeout(timeout);
      release();
      await holding;
    }
    const result = await refresh;
    const rows = await db.securityCatalogueListing.findMany({
      where: { snapshotId: result.version! },
      orderBy: { symbol: "asc" },
    });
    expect(
      rows.map(({ symbol, name, mic, exchange, hasHistory, country }) => ({
        symbol,
        name,
        mic,
        exchange,
        hasHistory,
        country,
      })),
    ).toEqual([
      {
        symbol: "NEE 6.219",
        name: 'A "quoted" name; --',
        mic: "XETRA",
        exchange: "Provider's Exchange",
        hasHistory: false,
        country: null,
      },
      {
        symbol: "O'NEIL",
        name: 'A "quoted" name; --',
        mic: "XETRA",
        exchange: "Provider's Exchange",
        hasHistory: null,
        country: null,
      },
    ]);
  });
  test("publishes only complete snapshots, retains old versions for 48 hours and queries full metadata", async () => {
    const first = await refreshCatalogue(db, {
      fetchPage: page,
      now: () => now,
      exchangeCountries: new Map([
        ["XNAS", "US"],
        ["XSWX", "CH"],
      ]),
    });
    expect(first).toMatchObject({ status: "completed", rows: 3, pages: 1 });
    // Use a publication time close to the test clock so the retained version is readable.
    const published = new Date();
    await db.securityCatalogueSnapshot.update({
      where: { id: first.version! },
      data: { publishedAt: published },
    });
    const second = await refreshCatalogue(db, {
      fetchPage: async (offset) => ({
        data: [sample("NEW")],
        pagination: { offset, count: 1, total: 1 },
      }),
      now: () => published,
    });
    expect((await catalogueStatus(db)).version).toBe(second.version);
    expect((await readSnapshot(db, first.version!))?.expiresAt).toEqual(
      new Date(published.getTime() + 1 + 48 * 60 * 60 * 1000),
    );
    const scope = {
      version: first.version!,
      criteria: { query: "abc", exchange: null },
    };
    const result = await searchCatalogue(db, {
      ...scope,
      offset: 0,
      limit: 20,
      filters: { country: ["CH"] },
      sorts: [{ field: "exchange", direction: "asc" }],
    });
    expect(result.totalCount).toBe(2);
    expect(result.filteredCount).toBe(1);
    expect(result.rows[0]).toMatchObject({
      symbol: "ABC",
      mic: "XSWX",
      country: "CH",
    });
    expect((await filterOptions(db, scope)).exchange).toEqual([
      "NASDAQ (XNAS)",
      "Swiss (XSWX)",
    ]);
    await db.securityCatalogueSnapshot.update({
      where: { id: first.version! },
      data: { expiresAt: new Date(0) },
    });
    await expect(readSnapshot(db, first.version!)).rejects.toThrow("updated");
  });
  test("staged rows stay invisible, and malformed or interrupted refreshes preserve the current snapshot", async () => {
    const first = await refreshCatalogue(db, { fetchPage: page });
    for (const fetchPage of [
      async () => {
        throw new Error("provider unavailable");
      },
      async (offset: number) => {
        expect((await catalogueStatus(db)).version).toBe(first.version);
        return {
          data: [sample("DUP"), sample("DUP")],
          pagination: { offset, count: 2, total: 2 },
        };
      },
      async (offset: number) => ({
        data: [],
        pagination: { offset, count: 0, total: 10 },
      }),
    ]) {
      await expect(refreshCatalogue(db, { fetchPage })).rejects.toThrow();
      expect(await db.securityCatalogueSnapshot.count()).toBe(1);
      expect((await catalogueStatus(db)).version).toBe(first.version);
    }
  });
  test("follows pages and rejects changed totals without publishing partial data", async () => {
    const result = await refreshCatalogue(db, {
      fetchPage: async (offset) => ({
        data: [sample(String(offset))],
        pagination: { offset, count: 1, total: 2 },
      }),
    });
    expect(result).toMatchObject({ rows: 2, pages: 2 });
    await expect(
      refreshCatalogue(db, {
        fetchPage: async (offset) => ({
          data: [sample(String(offset))],
          pagination: { offset, count: 1, total: offset ? 3 : 2 },
        }),
      }),
    ).rejects.toThrow("pagination");
    expect((await catalogueStatus(db)).version).toBe(result.version);
  });
  test("overlapping jobs cannot refresh while the advisory lock is held", async () => {
    let release!: () => void;
    let ready!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const holding = db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CATALOGUE_LOCK})`;
        ready();
        await gate;
      },
      { timeout: 10000 },
    );
    await locked;
    try {
      expect(
        await refreshCatalogue(db, {
          fetchPage: async () => {
            throw new Error("must not fetch");
          },
        }),
      ).toMatchObject({ status: "skipped" });
      expect(await db.securityCatalogueSnapshot.count()).toBe(0);
    } finally {
      release();
      await holding;
    }
  });
});

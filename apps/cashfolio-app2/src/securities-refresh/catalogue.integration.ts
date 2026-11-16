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
  process.env.SECURITIES_TEST_DATABASE_URL ??
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
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(${CATALOGUE_LOCK})`;
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

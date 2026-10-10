import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { CLEANUP_LOG_PREFIX, cleanupProviderUsage } from "./run";
import { createCleanupStore } from "./store";
import { getProviderUsageClient } from "../server/valuation/provider-usage-db.server";
import {
  fetchSecurityPriceFromMarketstack,
  fetchUsdPerCryptocurrencyRateFromCoinLayer,
  fetchUsdToCurrencyRateFromCurrencyLayer,
} from "../server/valuation/providers";
import { PROVIDER_USAGE_WRITE_DEADLINE_MS } from "../server/valuation/provider-usage";

const execute = promisify(execFile);
const adminUrl = new URL(
  process.env.PROVIDER_USAGE_CLEANUP_TEST_DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5433/postgres",
);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(adminUrl.hostname) ||
  adminUrl.pathname !== "/postgres"
) {
  throw new Error(
    "Cleanup integration tests require a local maintenance database.",
  );
}
const databaseName = `usage_cleanup_test_${randomUUID().replaceAll("-", "")}`;
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl.href }),
});
const client = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl.href }),
});
let databaseCreated = false;
let usageClient: PrismaClient | undefined;
const now = new Date("2026-10-10T12:00:00Z");
const cutoff = new Date("2026-07-12T12:00:00Z");
const base = {
  provider: "CURRENCYLAYER" as const,
  unitType: "CURRENCY" as const,
  outcome: "RETRIEVED" as const,
  requestReason: "INITIAL_PROBE" as const,
  durationMs: 1,
  valuationDate: new Date("2000-01-01"),
};

describe("provider usage cleanup against disposable PostgreSQL", () => {
  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    await execute("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: databaseUrl.href },
      maxBuffer: 4 * 1024 * 1024,
    });
    vi.stubEnv("DATABASE_URL", databaseUrl.href);
    vi.stubEnv("CURRENCYLAYER_API_KEY", "test-key");
    vi.stubEnv("COINLAYER_API_KEY", "test-key");
    vi.stubEnv("MARKETSTACK_API_KEY", "test-key");
  });
  beforeEach(async () => {
    await client.valuationProviderRequest.deleteMany();
  });
  afterAll(async () => {
    await usageClient?.$disconnect();
    delete global.__providerUsageDb__;
    vi.unstubAllEnvs();
    await client.$disconnect();
    try {
      if (databaseCreated)
        await admin.$executeRawUnsafe(
          `DROP DATABASE "${databaseName}" WITH (FORCE)`,
        );
    } finally {
      await admin.$disconnect();
    }
  });

  test("a locked usage table does not block provider rates, provider errors, or app-data reads", async () => {
    usageClient = getProviderUsageClient();
    await usageClient.$connect();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, quotes: { USDCHF: 0.9 } }),
        ),
      )
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    let signalReady!: () => void;
    let releaseLock!: () => void;
    const ready = new Promise<void>((resolve) => {
      signalReady = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const lock = client.$transaction(
      async (tx) => {
        await tx.$executeRaw`LOCK TABLE "ValuationProviderRequest" IN ACCESS EXCLUSIVE MODE`;
        signalReady();
        await release;
      },
      { timeout: 10_000 },
    );
    await ready;
    try {
      const started = performance.now();
      await expect(
        fetchUsdToCurrencyRateFromCurrencyLayer("CHF", now),
      ).resolves.toBe(0.9);
      await expect(
        fetchUsdPerCryptocurrencyRateFromCoinLayer("BTC", now),
      ).rejects.toThrow("Coinlayer request failed with 503");
      expect(performance.now() - started).toBeLessThan(
        2 * PROVIDER_USAGE_WRITE_DEADLINE_MS + 1_000,
      );
      await expect(client.user.count()).resolves.toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        "Failed to record valuation provider usage; continuing without usage row.",
      );
    } finally {
      releaseLock();
      await lock;
      fetchSpy.mockRestore();
      infoSpy.mockRestore();
      warnSpy.mockRestore();
    }
    expect(await client.valuationProviderRequest.count()).toBe(0);
  });

  test("an exhausted accounting pool fails quickly without queued inserts leaking after release", async () => {
    usageClient = getProviderUsageClient();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({ data: [{ close: 180, currency: "USD" }] }),
          ),
      );
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    let signalReady!: () => void;
    let releasePool!: () => void;
    const ready = new Promise<void>((resolve) => {
      signalReady = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releasePool = resolve;
    });
    const held = usageClient.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1`;
        signalReady();
        await release;
      },
      { timeout: 10_000 },
    );
    await ready;
    try {
      const started = performance.now();
      await expect(
        fetchSecurityPriceFromMarketstack("AAPL", "USD", now),
      ).resolves.toBe(180);
      expect(performance.now() - started).toBeLessThan(
        PROVIDER_USAGE_WRITE_DEADLINE_MS + 500,
      );
    } finally {
      releasePool();
      await held;
    }
    try {
      expect(await client.valuationProviderRequest.count()).toBe(0);
      await expect(
        fetchSecurityPriceFromMarketstack("AAPL", "USD", now),
      ).resolves.toBe(180);
      expect(await client.valuationProviderRequest.count()).toBe(1);
    } finally {
      fetchSpy.mockRestore();
      infoSpy.mockRestore();
    }
  });

  test("uses requestedAt, preserves the boundary, and batches 2,005 expired requests", async () => {
    await client.valuationProviderRequest.createMany({
      data: [
        ...Array.from({ length: 2_005 }, (_, index) => ({
          ...base,
          id: `expired-${index}`,
          requestedAt: new Date(cutoff.getTime() - index - 1),
        })),
        { ...base, id: "boundary", requestedAt: cutoff },
        { ...base, id: "recent-old-valuation", requestedAt: now },
      ],
    });
    const store = createCleanupStore(client);
    const result = await cleanupProviderUsage(store, { now });
    expect(result).toMatchObject({
      status: "completed",
      deletedRows: 2_005,
      batchCount: 3,
    });
    expect(result.tableBytes).toBeGreaterThan(0);
    expect(
      (await client.valuationProviderRequest.findMany())
        .map((row) => row.id)
        .sort(),
    ).toEqual(["boundary", "recent-old-valuation"]);
    expect(await cleanupProviderUsage(store, { now })).toMatchObject({
      deletedRows: 0,
    });
  });

  test("deletes oldest rows first and commits each batch despite a later failure", async () => {
    await client.valuationProviderRequest.createMany({
      data: [
        { ...base, id: "oldest", requestedAt: new Date("2000-01-01") },
        { ...base, id: "next", requestedAt: new Date("2001-01-01") },
      ],
    });
    const store = createCleanupStore(client);
    expect(await store.deleteBatch(cutoff, 1, 30_000)).toBe(1);
    expect(
      await client.valuationProviderRequest.findUnique({
        where: { id: "oldest" },
      }),
    ).toBeNull();
    await expect(
      cleanupProviderUsage(
        {
          ...store,
          deleteBatch: async () => {
            throw new Error("database failure");
          },
        },
        { now },
      ),
    ).rejects.toThrow();
    expect(await client.valuationProviderRequest.count()).toBe(1);
  });

  test("bounded lock waits fail safely and a subsequent run resumes", async () => {
    await client.valuationProviderRequest.create({
      data: { ...base, id: "locked", requestedAt: new Date("2000-01-01") },
    });
    let signalReady!: () => void;
    let releaseLock!: () => void;
    const ready = new Promise<void>((resolve) => {
      signalReady = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const lock = client.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "ValuationProviderRequest" WHERE "id" = 'locked' FOR UPDATE`;
        signalReady();
        await release;
      },
      { timeout: 10_000 },
    );
    await ready;
    try {
      await expect(
        createCleanupStore(client).deleteBatch(cutoff, 1_000, 100),
      ).rejects.toThrow();
    } finally {
      releaseLock();
      await lock;
    }
    expect(await client.valuationProviderRequest.count()).toBe(1);
    expect(
      await cleanupProviderUsage(createCleanupStore(client), { now }),
    ).toMatchObject({ deletedRows: 1 });
  });

  test("standalone payload runs without node_modules or web configuration and fails on errors", async () => {
    const directory = await mkdtemp(join(tmpdir(), "provider-usage-payload-"));
    try {
      await cp("dist/provider-usage-cleanup", directory, { recursive: true });
      const payload = join(directory, "cleanup.mjs");
      const { stdout } = await execute(process.execPath, [payload], {
        env: { DATABASE_URL: databaseUrl.href },
        cwd: directory,
      });
      const summaries = stdout
        .trim()
        .split("\n")
        .filter((line) => line.startsWith(CLEANUP_LOG_PREFIX))
        .map((line) => JSON.parse(line.slice(CLEANUP_LOG_PREFIX.length)));
      expect(summaries.at(-1)).toMatchObject({
        status: "completed",
        deletedRows: 0,
      });
      await expect(
        execute(process.execPath, [payload], { env: {}, cwd: directory }),
      ).rejects.toMatchObject({ code: 1 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

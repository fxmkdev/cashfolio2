import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    valuationProviderRequest: { create: vi.fn() },
  };
  return {
    tx,
    prisma: {
      $transaction: vi.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    },
    adapter: vi.fn(),
    create: vi.fn(),
  };
});
vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class {
    constructor(options: unknown) {
      mocks.adapter(options);
    }
  },
}));
vi.mock("../../.prisma-client/client", () => ({
  PrismaClient: vi.fn(function (options: unknown) {
    mocks.create(options);
    return mocks.prisma;
  }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete global.__providerUsageDb__;
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://user:secret@localhost/test?query_timeout=999999",
  );
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => {
  delete global.__providerUsageDb__;
  vi.unstubAllEnvs();
});

test("uses an isolated single-connection pool with bounded acquisition and query waits", async () => {
  const { getProviderUsageClient } = await import("./provider-usage-db.server");
  expect(getProviderUsageClient()).toBe(mocks.prisma);
  expect(mocks.adapter).toHaveBeenCalledWith({
    connectionString: "postgresql://user:secret@localhost/test",
    max: 1,
    connectionTimeoutMillis: 250,
    query_timeout: 750,
  });
  expect(getProviderUsageClient()).toBe(mocks.prisma);
  vi.resetModules();
  expect(
    (await import("./provider-usage-db.server")).getProviderUsageClient(),
  ).toBe(mocks.prisma);
  expect(mocks.create).toHaveBeenCalledOnce();
});

test("reuses one production client without adding a development global", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const { getProviderUsageClient } = await import("./provider-usage-db.server");
  getProviderUsageClient();
  getProviderUsageClient();
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(global.__providerUsageDb__).toBeUndefined();
});

test("fails safely when database configuration is missing", async () => {
  vi.stubEnv("DATABASE_URL", undefined);
  const { getProviderUsageClient } = await import("./provider-usage-db.server");
  expect(getProviderUsageClient).toThrow("Missing database configuration");
});

test("applies transaction-local statement and lock limits before inserting", async () => {
  const { writeProviderUsage } = await import("./provider-usage-db.server");
  const data = {
    provider: "CURRENCYLAYER" as const,
    unitType: "CURRENCY" as const,
    outcome: "RETRIEVED" as const,
    requestReason: "INITIAL_PROBE" as const,
    valuationDate: new Date(),
    requestedAt: new Date(),
    durationMs: 1,
  };
  await writeProviderUsage(data);
  expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
    maxWait: 250,
    timeout: 750,
  });
  expect(mocks.tx.$queryRaw.mock.calls.map((call) => call[0].join(""))).toEqual(
    [
      "SELECT set_config('statement_timeout', '500', true)",
      "SELECT set_config('lock_timeout', '250', true)",
    ],
  );
  expect(mocks.tx.valuationProviderRequest.create).toHaveBeenCalledWith({
    data,
  });
});

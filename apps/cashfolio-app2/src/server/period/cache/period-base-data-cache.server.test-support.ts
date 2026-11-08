import { defaultAssetClassIds } from "../../../shared/classification/asset-class";

import { vi } from "vitest";

import { AccountType, Unit } from "../../../.prisma-client/enums";

const redisState = vi.hoisted(() => ({
  kv: new Map<string, string>(),
  sets: new Map<string, Set<string>>(),
}));

const redisClient = vi.hoisted(() => ({
  get: vi.fn(async (key: string) => redisState.kv.get(key) ?? null),
  set: vi.fn(async (key: string, value: string, options?: { NX: boolean }) => {
    if (!options?.NX || !redisState.kv.has(key)) {
      redisState.kv.set(key, value);
    }
  }),
  setEx: vi.fn(async (key: string, _ttl: number, value: string) => {
    redisState.kv.set(key, value);
  }),
  sAdd: vi.fn(async (key: string, value: string) => {
    const next = redisState.sets.get(key) ?? new Set<string>();
    next.add(value);
    redisState.sets.set(key, next);
  }),
  expire: vi.fn(async () => 1),
  sMembers: vi.fn(async (key: string) =>
    Array.from(redisState.sets.get(key) ?? new Set<string>()),
  ),
  del: vi.fn(async (keys: string[] | string) => {
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const key of keyList) {
      redisState.kv.delete(key);
      redisState.sets.delete(key);
    }
    return keyList.length;
  }),
}));

const getRedisClient = vi.hoisted(() =>
  vi.fn<() => Promise<typeof redisClient | null>>(async () => redisClient),
);

const prisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
  accountBook: {
    findUniqueOrThrow: vi.fn(),
  },
  accountGroup: {
    findMany: vi.fn(),
  },
  account: {
    findMany: vi.fn(),
  },
  booking: {
    groupBy: vi.fn(),
    findMany: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
  },
}));

const loadTransferClearingUnitBuckets = vi.hoisted(() => vi.fn());

vi.mock("../../../redis.server", () => ({
  getRedisClient,
}));

vi.mock("../../../prisma.server", () => ({
  prisma,
}));

vi.mock("../transfer-clearing/period-transfer-clearing.server", () => ({
  loadTransferClearingUnitBuckets,
}));
const resetBaseDataCache = () => {
  redisState.kv.clear();
  redisState.sets.clear();
  vi.resetAllMocks();
  prisma.$executeRaw.mockResolvedValue(0);
  prisma.$transaction.mockImplementation(async (load) => load(prisma));
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
  process.env.PERIOD_BASE_CACHE_ENV = "preview-app-123";

  prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
    classificationSchemes: [],
    referenceCurrency: "CHF",
    periodCacheRevision: "0",
    startDate: new Date("2026-01-01T00:00:00.000Z"),
  });
  prisma.accountGroup.findMany.mockResolvedValue([]);
  prisma.account.findMany.mockImplementation(
    async (args: { where?: unknown }) => {
      const where = args.where as { type?: unknown } | undefined;
      if (
        where &&
        typeof where.type === "object" &&
        where.type != null &&
        "in" in where.type
      ) {
        return [
          {
            id: "asset-1",
            name: "Cash",
            classifications: [{ nodeId: defaultAssetClassIds.EQUITIES }],
            trackingMethod: "INDIVIDUAL_UNITS",
            isCashAccount: false,

            groupId: null,
            type: AccountType.BALANCE,
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
          },
        ];
      }
      return [];
    },
  );
  prisma.booking.groupBy.mockResolvedValue([]);
  prisma.booking.findMany.mockResolvedValue([]);
  prisma.transaction.findMany.mockResolvedValue([]);
  loadTransferClearingUnitBuckets.mockResolvedValue([]);
};
const cleanupBaseDataCache = () => {
  vi.useRealTimers();
  delete process.env.PERIOD_BASE_CACHE_ENV;
};
export {
  cleanupBaseDataCache,
  getRedisClient,
  periodBaseCache,
  prisma,
  redisClient,
  redisState,
  resetBaseDataCache,
};

// Register mocks before importing the tested modules and their dependencies.
const periodBaseCache = await import("./period-base-data-cache.server");

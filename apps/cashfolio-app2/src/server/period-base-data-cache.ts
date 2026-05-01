import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { prisma } from "../prisma.server";
import { getRedisClient } from "../redis.server";
import { normalizePeriodValue, PERIOD_PRESET_VALUES } from "../shared/period";
import { startOfUtcDay } from "../shared/date";
import { resolveExplicitCounterpartNonEquityAccounts } from "./period-gains-losses-contributions";
import { filterConvertibleHoldingAccounts } from "./period-helpers";
import {
  getPeriodEndExclusive,
  resolvePeriodSelection,
  type PeriodSpecifier,
} from "./period-selection";
import { loadTransferClearingUnitBuckets } from "./period-transfer-clearing";
import type { TransferClearingUnitBucket } from "./period-transfer-clearing";

const PERIOD_BASE_CACHE_TTL_SECONDS = 24 * 60 * 60;
const PERIOD_BASE_CACHE_MAX_SERIALIZED_BYTES = 2 * 1024 * 1024;

const PERIOD_BASE_CACHE_ENTRY_PREFIX = "period:base:v1";
const PERIOD_BASE_CACHE_INDEX_PREFIX = "period:base:index:v1";
const PERIOD_BASE_CACHE_GENERATION_PREFIX = "period:base:generation:v1";

let hasWarnedPeriodBaseCacheReadFailure = false;
let hasWarnedPeriodBaseCacheWriteFailure = false;
let hasWarnedPeriodBaseCacheInvalidationFailure = false;
let hasWarnedPeriodBaseCacheNamespaceFailure = false;

const inflightByCacheKey = new Map<string, Promise<PeriodBaseData>>();

type CachedDate = { __cashfolioDateMs: number };

type PeriodBaseSelectionData = {
  periodValue: string;
  label: string;
  periodSpecifier: PeriodSpecifier;
  granularity: "month" | "year";
  year: number;
  month: number | null;
  from: Date;
  to: Date;
  queryEndExclusive: Date;
  initialHoldingDate: Date;
  isBeforeAccountBookStart: boolean;
  minPeriodDate: Date;
  currentDay: Date;
};

type PeriodBaseAssetLiabilityAccount = {
  id: string;
  name: string;
  groupId: string | null;
  type: AccountType;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

type PeriodBaseAccountGroup = {
  id: string;
  name: string;
  parentGroupId: string | null;
};

type PeriodBaseEquityBooking = {
  id: string;
  accountId: string;
  accountName: string;
  accountGroupId: string | null;
  equityAccountSubtype: EquityAccountSubtype;
  transactionId: string;
  date: Date;
  value: number;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

type PeriodBaseExplicitCounterpart = {
  transactionId: string;
  accountId: string;
  accountName: string;
};

type PeriodBaseRawBalance = {
  accountId: string;
  rawBalance: number;
};

type PeriodBaseHoldingBooking = {
  id: string;
  accountId: string;
  date: Date;
  value: number;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  accountType: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
};

type PeriodBaseHoldingTransaction = {
  id: string;
  bookings: PeriodBaseHoldingBooking[];
};

type PeriodBaseInitialHoldingBalance = {
  accountId: string;
  rawBalance: number;
};

export type PeriodBaseData = {
  accountBookId: string;
  periodValue: string;
  referenceCurrency: string;
  selection: PeriodBaseSelectionData;
  allAccountGroups: PeriodBaseAccountGroup[];
  baseAssetLiabilityAccounts: PeriodBaseAssetLiabilityAccount[];
  holdingAccountsResolved: ReturnType<typeof filterConvertibleHoldingAccounts>;
  endOfPeriodRawBalances: PeriodBaseRawBalance[];
  transferClearingUnitBuckets: TransferClearingUnitBucket[];
  equityBookings: PeriodBaseEquityBooking[];
  explicitCounterparts: PeriodBaseExplicitCounterpart[];
  initialHoldingBalances: PeriodBaseInitialHoldingBalance[];
  holdingTransactions: PeriodBaseHoldingTransaction[];
};

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isCachedDate(value: unknown): value is CachedDate {
  return (
    typeof value === "object" &&
    value != null &&
    "__cashfolioDateMs" in value &&
    typeof (value as { __cashfolioDateMs?: unknown }).__cashfolioDateMs ===
      "number"
  );
}

function encodeDatesForCache<T>(value: T): unknown {
  if (value instanceof Date) {
    return { __cashfolioDateMs: value.getTime() } satisfies CachedDate;
  }

  if (Array.isArray(value)) {
    return value.map((item) => encodeDatesForCache(item));
  }

  if (typeof value === "object" && value != null) {
    const record = value as Record<string, unknown>;
    const encodedRecord: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(record)) {
      encodedRecord[key] = encodeDatesForCache(entryValue);
    }
    return encodedRecord;
  }

  return value;
}

function decodeDatesFromCache<T>(value: unknown): T {
  if (isCachedDate(value)) {
    return new Date(value.__cashfolioDateMs) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => decodeDatesFromCache(item)) as T;
  }

  if (typeof value === "object" && value != null) {
    const record = value as Record<string, unknown>;
    const decodedRecord: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(record)) {
      decodedRecord[key] = decodeDatesFromCache(entryValue);
    }
    return decodedRecord as T;
  }

  return value as T;
}

function getCacheEnvOrThrowWhenRedisAvailable(): string {
  const rawCacheEnv = process.env.PERIOD_BASE_CACHE_ENV?.trim();
  if (rawCacheEnv) {
    return rawCacheEnv;
  }

  if (!hasWarnedPeriodBaseCacheNamespaceFailure) {
    console.error(
      "PERIOD_BASE_CACHE_ENV must be set when Redis-backed period base-data cache is enabled.",
    );
    hasWarnedPeriodBaseCacheNamespaceFailure = true;
  }

  throw new Error(
    "PERIOD_BASE_CACHE_ENV must be set when Redis-backed period base-data cache is enabled.",
  );
}

function getPeriodBaseCacheEntryKey(args: {
  cacheEnv: string;
  accountBookId: string;
  generation: string;
  periodCacheKey: string;
}) {
  return `${PERIOD_BASE_CACHE_ENTRY_PREFIX}:${args.cacheEnv}:${args.accountBookId}:${args.generation}:${args.periodCacheKey}`;
}

function getPeriodBaseCacheIndexKey(args: {
  cacheEnv: string;
  accountBookId: string;
  generation: string;
}) {
  return `${PERIOD_BASE_CACHE_INDEX_PREFIX}:${args.cacheEnv}:${args.accountBookId}:${args.generation}`;
}

function getPeriodBaseCacheGenerationKey(args: {
  cacheEnv: string;
  accountBookId: string;
}) {
  return `${PERIOD_BASE_CACHE_GENERATION_PREFIX}:${args.cacheEnv}:${args.accountBookId}`;
}

function isPresetPeriodValue(value: string): boolean {
  return (PERIOD_PRESET_VALUES as readonly string[]).includes(value);
}

function formatUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function resolvePeriodBaseCachePeriodKey(args: {
  accountBookId: string;
  periodValue: string;
}): Promise<string> {
  if (!isPresetPeriodValue(args.periodValue)) {
    return args.periodValue;
  }

  const accountBook = await prisma.accountBook.findUniqueOrThrow({
    where: { id: args.accountBookId },
    select: {
      startDate: true,
    },
  });

  const selection = resolvePeriodSelection({
    periodValue: args.periodValue,
    now: new Date(),
    firstBookingDate: startOfUtcDay(accountBook.startDate),
  });

  return `${selection.granularity}:${formatUtcDateKey(selection.from)}:${formatUtcDateKey(selection.to)}`;
}

async function getPeriodBaseCacheGeneration(args: {
  cacheEnv: string;
  accountBookId: string;
  redis: NonNullable<Awaited<ReturnType<typeof getRedisClient>>>;
}): Promise<string> {
  const generationKey = getPeriodBaseCacheGenerationKey({
    cacheEnv: args.cacheEnv,
    accountBookId: args.accountBookId,
  });

  try {
    const generation = await args.redis.get(generationKey);
    if (generation && generation.trim().length > 0) {
      return generation.trim();
    }
  } catch (error) {
    if (!hasWarnedPeriodBaseCacheReadFailure) {
      console.warn(
        "Failed to read period base-data cache entry; continuing uncached.",
        error,
      );
      hasWarnedPeriodBaseCacheReadFailure = true;
    }
  }

  return "0";
}

async function loadPeriodEquityBookingsRaw(args: {
  accountBookId: string;
  queryStart: Date;
  queryEndExclusive: Date;
  equityAccountById: Map<
    string,
    {
      id: string;
      name: string;
      groupId: string | null;
      equityAccountSubtype: EquityAccountSubtype | null;
    }
  >;
  equityAccountIds: string[];
}): Promise<PeriodBaseEquityBooking[]> {
  const usesPreloadedEquityAccountFilter = args.equityAccountIds.length > 0;
  const results: PeriodBaseEquityBooking[] = [];
  let nextBookingIdCursor: string | undefined;

  while (true) {
    const bookingsPage = await prisma.booking.findMany({
      where: {
        accountBookId: args.accountBookId,
        date: {
          gte: args.queryStart,
          lt: args.queryEndExclusive,
        },
        ...(usesPreloadedEquityAccountFilter
          ? {
              accountId: {
                in: args.equityAccountIds,
              },
            }
          : {
              account: {
                type: AccountType.EQUITY,
                equityAccountSubtype: {
                  in: [
                    EquityAccountSubtype.INCOME,
                    EquityAccountSubtype.EXPENSE,
                    EquityAccountSubtype.GAIN_LOSS,
                  ],
                },
              },
            }),
      },
      orderBy: { id: "asc" },
      take: 1_000,
      ...(nextBookingIdCursor
        ? {
            cursor: {
              id_accountBookId: {
                id: nextBookingIdCursor,
                accountBookId: args.accountBookId,
              },
            },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        accountId: true,
        transactionId: true,
        date: true,
        value: true,
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
        ...(usesPreloadedEquityAccountFilter
          ? {}
          : {
              account: {
                select: {
                  id: true,
                  name: true,
                  groupId: true,
                  equityAccountSubtype: true,
                },
              },
            }),
      },
    });

    if (bookingsPage.length === 0) {
      break;
    }

    nextBookingIdCursor = bookingsPage[bookingsPage.length - 1].id;

    for (const booking of bookingsPage) {
      const bookingAccountId = booking.accountId ?? booking.account?.id;
      if (!bookingAccountId) {
        throw new Error(
          "Equity booking invariant violated: booking is missing accountId.",
        );
      }

      const account =
        args.equityAccountById.get(bookingAccountId) ??
        (booking.account &&
        booking.account.id &&
        booking.account.name &&
        (booking.account.equityAccountSubtype === EquityAccountSubtype.INCOME ||
          booking.account.equityAccountSubtype ===
            EquityAccountSubtype.EXPENSE ||
          booking.account.equityAccountSubtype ===
            EquityAccountSubtype.GAIN_LOSS)
          ? {
              id: booking.account.id,
              name: booking.account.name,
              groupId: booking.account.groupId ?? null,
              equityAccountSubtype: booking.account.equityAccountSubtype,
            }
          : null);
      if (
        !account ||
        (account.equityAccountSubtype !== EquityAccountSubtype.INCOME &&
          account.equityAccountSubtype !== EquityAccountSubtype.EXPENSE &&
          account.equityAccountSubtype !== EquityAccountSubtype.GAIN_LOSS)
      ) {
        throw new Error(
          `Equity booking invariant violated for account ${booking.accountId}: missing preloaded equity account metadata.`,
        );
      }

      results.push({
        id: booking.id,
        accountId: bookingAccountId,
        accountName: account.name,
        accountGroupId: account.groupId,
        equityAccountSubtype: account.equityAccountSubtype,
        transactionId: booking.transactionId,
        date: booking.date,
        value: Number(booking.value),
        unit: booking.unit,
        currency: booking.currency,
        cryptocurrency: booking.cryptocurrency,
        symbol: booking.symbol,
        tradeCurrency: booking.tradeCurrency,
      });
    }

    if (bookingsPage.length < 1_000) {
      break;
    }
  }

  return results;
}

async function loadPeriodHoldingTransactionsRaw(args: {
  accountBookId: string;
  holdingAccountIds: string[];
  queryStart: Date;
  queryEndExclusive: Date;
}): Promise<PeriodBaseHoldingTransaction[]> {
  const results: PeriodBaseHoldingTransaction[] = [];
  if (args.holdingAccountIds.length === 0) {
    return results;
  }

  let nextTransactionIdCursor: string | undefined;

  while (true) {
    const transactionsPage = await prisma.transaction.findMany({
      where: {
        accountBookId: args.accountBookId,
        AND: [
          {
            bookings: {
              some: {
                accountId: {
                  in: args.holdingAccountIds,
                },
                date: {
                  gte: args.queryStart,
                  lt: args.queryEndExclusive,
                },
              },
            },
          },
          {
            bookings: {
              none: {
                date: {
                  gte: args.queryEndExclusive,
                },
              },
            },
          },
          {
            bookings: {
              none: {
                account: {
                  type: AccountType.EQUITY,
                  equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
                },
              },
            },
          },
        ],
      },
      orderBy: { id: "asc" },
      take: 200,
      ...(nextTransactionIdCursor
        ? {
            cursor: {
              id_accountBookId: {
                id: nextTransactionIdCursor,
                accountBookId: args.accountBookId,
              },
            },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        bookings: {
          select: {
            id: true,
            accountId: true,
            date: true,
            value: true,
            unit: true,
            currency: true,
            cryptocurrency: true,
            symbol: true,
            tradeCurrency: true,
            account: {
              select: {
                type: true,
                equityAccountSubtype: true,
              },
            },
          },
          orderBy: [{ date: "asc" }, { id: "asc" }],
        },
      },
    });

    if (transactionsPage.length === 0) {
      break;
    }

    for (const transaction of transactionsPage) {
      results.push({
        id: transaction.id,
        bookings: transaction.bookings.map((booking) => ({
          id: booking.id,
          accountId: booking.accountId,
          date: booking.date,
          value: Number(booking.value),
          unit: booking.unit,
          currency: booking.currency,
          cryptocurrency: booking.cryptocurrency,
          symbol: booking.symbol,
          tradeCurrency: booking.tradeCurrency,
          accountType: booking.account.type,
          equityAccountSubtype: booking.account.equityAccountSubtype,
        })),
      });
    }

    nextTransactionIdCursor = transactionsPage[transactionsPage.length - 1].id;
    if (transactionsPage.length < 200) {
      break;
    }
  }

  return results;
}

export async function loadPeriodBaseDataUncached(args: {
  accountBookId: string;
  period?: unknown;
}): Promise<PeriodBaseData> {
  const periodValue = normalizePeriodValue(args.period);

  const accountBook = await prisma.accountBook.findUniqueOrThrow({
    where: { id: args.accountBookId },
    select: {
      referenceCurrency: true,
      startDate: true,
    },
  });

  const referenceCurrency = accountBook.referenceCurrency.toUpperCase();
  const [allAccountGroups, baseAssetLiabilityAccounts, equityAccounts] =
    await Promise.all([
      prisma.accountGroup.findMany({
        where: { accountBookId: args.accountBookId },
        select: {
          id: true,
          name: true,
          parentGroupId: true,
        },
      }),
      prisma.account.findMany({
        where: {
          accountBookId: args.accountBookId,
          type: {
            in: [AccountType.ASSET, AccountType.LIABILITY],
          },
        },
        select: {
          id: true,
          name: true,
          groupId: true,
          type: true,
          unit: true,
          currency: true,
          cryptocurrency: true,
          symbol: true,
          tradeCurrency: true,
        },
      }),
      prisma.account.findMany({
        where: {
          accountBookId: args.accountBookId,
          type: AccountType.EQUITY,
          equityAccountSubtype: {
            in: [
              EquityAccountSubtype.INCOME,
              EquityAccountSubtype.EXPENSE,
              EquityAccountSubtype.GAIN_LOSS,
            ],
          },
        },
        select: {
          id: true,
          name: true,
          groupId: true,
          equityAccountSubtype: true,
        },
      }),
    ]);

  const accountBookStartDate = startOfUtcDay(accountBook.startDate);
  const selection = resolvePeriodSelection({
    periodValue,
    now: new Date(),
    firstBookingDate: accountBookStartDate,
  });
  const queryEndExclusive = getPeriodEndExclusive(selection.to);
  const queryStart = selection.from;
  const initialHoldingDate = addUtcDays(queryStart, -1);
  const isBeforeAccountBookStart = selection.to < accountBookStartDate;

  const holdingAccountsResolved = filterConvertibleHoldingAccounts(
    baseAssetLiabilityAccounts,
    referenceCurrency,
  );
  const assetLiabilityAccountIds = baseAssetLiabilityAccounts.map(
    (account) => account.id,
  );
  const holdingAccountIds = holdingAccountsResolved.map(
    (account) => account.id,
  );
  const equityAccountIds = equityAccounts.map((account) => account.id);
  const equityAccountById = new Map(
    equityAccounts.map((account) => [account.id, account]),
  );

  const [endOfPeriodRawBalancesGrouped, transferClearingUnitBuckets] =
    await Promise.all([
      assetLiabilityAccountIds.length > 0
        ? prisma.booking.groupBy({
            by: ["accountId"],
            where: {
              accountBookId: args.accountBookId,
              accountId: { in: assetLiabilityAccountIds },
              date: { lt: queryEndExclusive },
            },
            _sum: { value: true },
          })
        : Promise.resolve([]),
      loadTransferClearingUnitBuckets({
        accountBookId: args.accountBookId,
        periodEndExclusive: queryEndExclusive,
        referenceCurrency,
      }),
    ]);

  const [equityBookings, initialHoldingBalancesGrouped, holdingTransactions] =
    await Promise.all([
      isBeforeAccountBookStart
        ? Promise.resolve([])
        : loadPeriodEquityBookingsRaw({
            accountBookId: args.accountBookId,
            queryStart,
            queryEndExclusive,
            equityAccountById,
            equityAccountIds,
          }),
      isBeforeAccountBookStart || holdingAccountIds.length === 0
        ? Promise.resolve([])
        : prisma.booking.groupBy({
            by: ["accountId"],
            where: {
              accountBookId: args.accountBookId,
              accountId: { in: holdingAccountIds },
              date: { lt: queryStart },
            },
            _sum: { value: true },
          }),
      isBeforeAccountBookStart
        ? Promise.resolve([])
        : loadPeriodHoldingTransactionsRaw({
            accountBookId: args.accountBookId,
            holdingAccountIds,
            queryStart,
            queryEndExclusive,
          }),
    ]);

  const explicitTransactionIds = Array.from(
    new Set(
      equityBookings
        .filter(
          (booking) =>
            booking.equityAccountSubtype === EquityAccountSubtype.GAIN_LOSS,
        )
        .map((booking) => booking.transactionId),
    ),
  );

  const explicitCounterpartByTransactionId = new Map<
    string,
    { id: string; name: string }
  >();
  if (explicitTransactionIds.length > 0) {
    await resolveExplicitCounterpartNonEquityAccounts({
      accountBookId: args.accountBookId,
      explicitTransactionIds,
      byTransactionId: explicitCounterpartByTransactionId,
    });
  }

  return {
    accountBookId: args.accountBookId,
    periodValue,
    referenceCurrency,
    selection: {
      periodValue: selection.periodValue,
      label: selection.label,
      periodSpecifier: selection.periodSpecifier,
      granularity: selection.granularity,
      year: selection.year,
      month: selection.month,
      from: selection.from,
      to: selection.to,
      queryEndExclusive,
      initialHoldingDate,
      isBeforeAccountBookStart,
      minPeriodDate: accountBookStartDate,
      currentDay: startOfUtcDay(new Date()),
    },
    allAccountGroups,
    baseAssetLiabilityAccounts,
    holdingAccountsResolved,
    endOfPeriodRawBalances: endOfPeriodRawBalancesGrouped.map((row) => ({
      accountId: row.accountId,
      rawBalance: Number(row._sum.value ?? 0),
    })),
    transferClearingUnitBuckets,
    equityBookings,
    explicitCounterparts: Array.from(
      explicitCounterpartByTransactionId.entries(),
    ).map(([transactionId, counterpart]) => ({
      transactionId,
      accountId: counterpart.id,
      accountName: counterpart.name,
    })),
    initialHoldingBalances: initialHoldingBalancesGrouped.map((row) => ({
      accountId: row.accountId,
      rawBalance: Number(row._sum.value ?? 0),
    })),
    holdingTransactions,
  };
}

export async function getOrLoadPeriodBaseData(args: {
  accountBookId: string;
  period?: unknown;
}): Promise<PeriodBaseData> {
  const periodValue = normalizePeriodValue(args.period);

  const redis = await getRedisClient();
  if (!redis) {
    return loadPeriodBaseDataUncached({
      accountBookId: args.accountBookId,
      period: periodValue,
    });
  }

  const cacheEnv = getCacheEnvOrThrowWhenRedisAvailable();
  const periodCacheKey = await resolvePeriodBaseCachePeriodKey({
    accountBookId: args.accountBookId,
    periodValue,
  });
  const generation = await getPeriodBaseCacheGeneration({
    cacheEnv,
    accountBookId: args.accountBookId,
    redis,
  });
  const entryKey = getPeriodBaseCacheEntryKey({
    cacheEnv,
    accountBookId: args.accountBookId,
    generation,
    periodCacheKey,
  });

  try {
    const cached = await redis.get(entryKey);
    if (cached) {
      const parsed = JSON.parse(cached) as unknown;
      return decodeDatesFromCache<PeriodBaseData>(parsed);
    }
  } catch (error) {
    if (!hasWarnedPeriodBaseCacheReadFailure) {
      console.warn(
        "Failed to read period base-data cache entry; continuing uncached.",
        error,
      );
      hasWarnedPeriodBaseCacheReadFailure = true;
    }
  }

  const inflightKey = entryKey;
  const existingInflight = inflightByCacheKey.get(inflightKey);
  if (existingInflight) {
    return existingInflight;
  }

  const loadPromise = (async () => {
    const loaded = await loadPeriodBaseDataUncached({
      accountBookId: args.accountBookId,
      period: periodValue,
    });

    try {
      const encoded = encodeDatesForCache(loaded);
      const serialized = JSON.stringify(encoded);
      if (
        Buffer.byteLength(serialized, "utf8") <=
        PERIOD_BASE_CACHE_MAX_SERIALIZED_BYTES
      ) {
        const indexKey = getPeriodBaseCacheIndexKey({
          cacheEnv,
          accountBookId: args.accountBookId,
          generation,
        });
        await redis.setEx(entryKey, PERIOD_BASE_CACHE_TTL_SECONDS, serialized);
        await redis.sAdd(indexKey, entryKey);
        await redis.expire(indexKey, PERIOD_BASE_CACHE_TTL_SECONDS);
      }
    } catch (error) {
      if (!hasWarnedPeriodBaseCacheWriteFailure) {
        console.warn(
          "Failed to write period base-data cache entry; continuing uncached.",
          error,
        );
        hasWarnedPeriodBaseCacheWriteFailure = true;
      }
    }

    return loaded;
  })();

  inflightByCacheKey.set(inflightKey, loadPromise);
  try {
    return await loadPromise;
  } finally {
    inflightByCacheKey.delete(inflightKey);
  }
}

export async function invalidatePeriodBaseDataCacheForAccountBook(
  accountBookId: string,
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }

  const cacheEnv = getCacheEnvOrThrowWhenRedisAvailable();
  const generation = await getPeriodBaseCacheGeneration({
    cacheEnv,
    accountBookId,
    redis,
  });
  const indexKey = getPeriodBaseCacheIndexKey({
    cacheEnv,
    accountBookId,
    generation,
  });
  const generationKey = getPeriodBaseCacheGenerationKey({
    cacheEnv,
    accountBookId,
  });

  try {
    const members = await redis.sMembers(indexKey);
    if (members.length > 0) {
      await redis.del([...members, indexKey]);
    } else {
      await redis.del(indexKey);
    }
    const nextGeneration = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await redis.set(generationKey, nextGeneration);

    const inflightPrefix = `${PERIOD_BASE_CACHE_ENTRY_PREFIX}:${cacheEnv}:${accountBookId}:`;
    for (const cacheKey of inflightByCacheKey.keys()) {
      if (cacheKey.startsWith(inflightPrefix)) {
        inflightByCacheKey.delete(cacheKey);
      }
    }
  } catch (error) {
    if (!hasWarnedPeriodBaseCacheInvalidationFailure) {
      console.warn(
        "Failed to invalidate period base-data cache entries; continuing without invalidation.",
        error,
      );
      hasWarnedPeriodBaseCacheInvalidationFailure = true;
    }
  }
}

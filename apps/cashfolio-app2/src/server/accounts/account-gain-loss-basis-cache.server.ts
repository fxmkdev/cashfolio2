import { checkResourceBudget } from "../resource-context.server";
import { rethrowResourceError } from "../resource-error";
import { prisma } from "../../prisma.server";
import { getRedisClient } from "../../redis.server";
import { addUtcDays } from "../../shared/date";
import { getAccountGainLossBasisCacheEntryKey } from "../../shared/book-cache-keys";
import { decodeMoneyCache, encodeMoneyCache } from "../money-cache-codec";
import {
  getPeriodCacheEnvOrThrowWhenRedisAvailable,
  getPeriodCacheGeneration,
} from "../period/cache/period-cache";
import { getUnitToReferenceExchangeRateDetails } from "../period/period-conversion";
import { createValuationLookupContext } from "../valuation/lookup-context";
import type { DecimalValuationRateLookupResult } from "../valuation/types";
import { valueAccountGainLossBasis } from "./account-gain-loss-calculation.server";
import { createAccountGainLossLookupScheduler } from "./account-gain-loss-prefetch.server";
import {
  finishAccountGainLossRange,
  loadAccountGainLossRange,
  type AccountGainLossBasisRange,
} from "./account-gain-loss-range.server";
import {
  isAccountGainLossBasisCacheData,
  isCompleteAccountGainLossBasis,
  toAccountGainLossBasisCacheData,
} from "./account-gain-loss-basis-cache-data";

const TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_SERIALIZED_BYTES = 2 * 1024 * 1024;
type Range = Awaited<ReturnType<typeof loadAccountGainLossRange>>;
const inflight = new Map<string, Promise<Range>>();
let hasWarnedReadFailure = false;
let hasWarnedWriteFailure = false;

/** A revision alone cannot detect a future booking becoming effective as time passes. */
async function readScope(args: { accountBookId: string; asOfDate: Date }) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const book = await tx.accountBook.findUniqueOrThrow({
        where: { id: args.accountBookId },
        select: { periodCacheRevision: true, startDate: true },
      });
      const booking = await tx.booking.findFirst({
        where: {
          accountBookId: args.accountBookId,
          date: { lt: addUtcDays(args.asOfDate, 1) },
        },
        orderBy: { date: "desc" },
        select: { date: true },
      });
      return {
        revision: book.periodCacheRevision,
        startDate: book.startDate,
        watermark: booking?.date.toISOString() ?? "empty",
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 30_000 },
  );
}

/** The outer summary cache remains the cheapest hit; this layer survives closing-price changes. */
export async function loadAccountGainLossSummaryRange(args: {
  accountBookId: string;
  asOfDate: Date;
}): Promise<Range> {
  const redis = await getRedisClient();
  if (!redis) return loadAccountGainLossRange(args);
  const cacheEnv = getPeriodCacheEnvOrThrowWhenRedisAvailable();
  let scope: Awaited<ReturnType<typeof readScope>>;
  try {
    scope = await readScope(args);
  } catch (error) {
    rethrowResourceError(error);
    return loadAccountGainLossRange(args);
  }
  if (args.asOfDate < scope.startDate) return loadAccountGainLossRange(args);
  const latestFetchableDate =
    createValuationLookupContext().latestFetchableDate;
  const cacheKey = getAccountGainLossBasisCacheEntryKey({
    cacheEnv,
    accountBookId: args.accountBookId,
    generation: scope.revision,
    watermark: scope.watermark,
  });
  // Share closing work only for the same requested date and publication window.
  const inflightKey = `${cacheKey}:${args.asOfDate.toISOString()}:${latestFetchableDate.toISOString()}`;
  const existing = inflight.get(inflightKey);
  if (existing) return existing;

  const promise = (async () => {
    let cachedBasis: AccountGainLossBasisRange | undefined;
    try {
      const encoded = await redis.get(cacheKey);
      if (
        encoded &&
        Buffer.byteLength(encoded, "utf8") <= MAX_SERIALIZED_BYTES
      ) {
        const parsed = decodeMoneyCache<unknown>(JSON.parse(encoded));
        if (
          isAccountGainLossBasisCacheData(parsed) &&
          parsed.revision === scope.revision &&
          parsed.watermark === scope.watermark &&
          parsed.startDate.getTime() === scope.startDate.getTime()
        )
          cachedBasis = parsed;
      }
    } catch (error) {
      rethrowResourceError(error);
      if (!hasWarnedReadFailure) {
        console.warn(
          "Failed to read account G/L basis cache; continuing uncached.",
          error,
        );
        hasWarnedReadFailure = true;
      }
    }
    if (cachedBasis) {
      const scheduleLookup = createAccountGainLossLookupScheduler();
      const exchangeRateByKey = new Map<
        string,
        Promise<DecimalValuationRateLookupResult>
      >();
      let cacheableFromPermanentValuationCache = true;
      const calculated = await valueAccountGainLossBasis({
        basis: cachedBasis.basis,
        periodEnd: args.asOfDate,
        resolveRate: async (input) => {
          const result = await getUnitToReferenceExchangeRateDetails({
            ...input,
            referenceCurrency: cachedBasis.referenceCurrency,
            exchangeRateByKey,
            scheduleLookup,
          });
          if (result.source !== "identity" && result.source !== "timeSeries")
            cacheableFromPermanentValuationCache = false;
          return result.rate;
        },
      });
      return finishAccountGainLossRange({
        ...cachedBasis,
        calculated,
        asOfDate: args.asOfDate,
        cacheableFromPermanentValuationCache,
      });
    }

    return loadAccountGainLossRange({
      ...args,
      onBasis: async (range, cacheable) => {
        if (
          !cacheable ||
          !isCompleteAccountGainLossBasis(range) ||
          range.revision !== scope.revision ||
          range.watermark !== scope.watermark ||
          (await getPeriodCacheGeneration({
            accountBookId: args.accountBookId,
          })) !== scope.revision ||
          createValuationLookupContext().latestFetchableDate.getTime() !==
            latestFetchableDate.getTime()
        )
          return;
        try {
          const encoded = JSON.stringify(
            encodeMoneyCache(toAccountGainLossBasisCacheData(range)),
          );
          if (Buffer.byteLength(encoded, "utf8") <= MAX_SERIALIZED_BYTES) {
            checkResourceBudget();
            await redis.setEx(cacheKey, TTL_SECONDS, encoded);
          }
        } catch (error) {
          rethrowResourceError(error);
          if (!hasWarnedWriteFailure) {
            console.warn(
              "Failed to write account G/L basis cache; continuing uncached.",
              error,
            );
            hasWarnedWriteFailure = true;
          }
        }
      },
    });
  })();
  inflight.set(inflightKey, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(inflightKey);
  }
}

import { prisma } from "../../prisma.server";
import {
  PERIOD_PRESET_LAST_MONTH,
  PERIOD_PRESET_MTD,
  PERIOD_PRESET_VALUES,
} from "../../shared/period";
import { startOfUtcDay } from "../../shared/date";
import { resolvePeriodSelection } from "./period-selection";

export const PERIOD_CACHE_TTL_SECONDS = 24 * 60 * 60;
export const PERIOD_CACHE_GENERATION_PREFIX = "period:base:generation:v1";

let hasWarnedPeriodCacheNamespaceFailure = false;
let hasWarnedPeriodCacheGenerationReadFailure = false;

export function formatUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isPresetPeriodValue(value: string): boolean {
  return (PERIOD_PRESET_VALUES as readonly string[]).includes(value);
}

function isCurrentExplicitPeriodValue(value: string): boolean {
  const now = startOfUtcDay(new Date());
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(value);
  if (monthMatch) {
    const year = Number(monthMatch[1]);
    const monthOneBased = Number(monthMatch[2]);
    return (
      year === now.getUTCFullYear() && monthOneBased === now.getUTCMonth() + 1
    );
  }

  const yearMatch = /^(\d{4})$/.exec(value);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    return year === now.getUTCFullYear();
  }

  return false;
}

export function getPeriodInflightCacheKey(periodValue: string): string {
  if (
    !isPresetPeriodValue(periodValue) &&
    !isCurrentExplicitPeriodValue(periodValue)
  ) {
    return periodValue;
  }

  return `${periodValue}:${formatUtcDateKey(startOfUtcDay(new Date()))}`;
}

export async function resolvePeriodCachePeriodKey(args: {
  accountBookId: string;
  periodValue: string;
}): Promise<string> {
  if (!isPresetPeriodValue(args.periodValue)) {
    if (isCurrentExplicitPeriodValue(args.periodValue)) {
      return `${args.periodValue}:${formatUtcDateKey(startOfUtcDay(new Date()))}`;
    }
    return args.periodValue;
  }

  // Month presets are independent of the account-book start date.
  // Derive keys directly so cache hits avoid an extra DB read.
  if (
    args.periodValue === PERIOD_PRESET_MTD ||
    args.periodValue === PERIOD_PRESET_LAST_MONTH
  ) {
    const selection = resolvePeriodSelection({
      periodValue: args.periodValue,
      now: new Date(),
    });

    return `${selection.granularity}:${formatUtcDateKey(selection.from)}:${formatUtcDateKey(selection.to)}`;
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

export function getPeriodCacheEnvOrThrowWhenRedisAvailable(): string {
  const rawCacheEnv = process.env.PERIOD_BASE_CACHE_ENV?.trim();
  if (rawCacheEnv) {
    return rawCacheEnv;
  }

  if (!hasWarnedPeriodCacheNamespaceFailure) {
    console.error(
      "PERIOD_BASE_CACHE_ENV must be set when Redis-backed period cache is enabled.",
    );
    hasWarnedPeriodCacheNamespaceFailure = true;
  }

  throw new Error(
    "PERIOD_BASE_CACHE_ENV must be set when Redis-backed period cache is enabled.",
  );
}

export function getPeriodCacheGenerationKey(args: {
  cacheEnv: string;
  accountBookId: string;
}) {
  return `${PERIOD_CACHE_GENERATION_PREFIX}:${args.cacheEnv}:${args.accountBookId}`;
}

export async function getPeriodCacheGeneration(args: {
  accountBookId: string;
}): Promise<string | null> {
  try {
    const book = await prisma.accountBook.findUniqueOrThrow({
      where: { id: args.accountBookId },
      select: { periodCacheRevision: true },
    });
    return book.periodCacheRevision;
  } catch (error) {
    if (!hasWarnedPeriodCacheGenerationReadFailure) {
      console.warn(
        "Failed to read account-book cache revision; continuing uncached.",
        error,
      );
      hasWarnedPeriodCacheGenerationReadFailure = true;
    }
  }

  return null;
}

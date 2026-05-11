import { getRedisClient } from "../redis.server";

export const PERIOD_CACHE_TTL_SECONDS = 24 * 60 * 60;
export const PERIOD_CACHE_GENERATION_PREFIX = "period:base:generation:v1";

let hasWarnedPeriodCacheNamespaceFailure = false;
let hasWarnedPeriodCacheGenerationReadFailure = false;

export type PeriodCacheRedisClient = NonNullable<
  Awaited<ReturnType<typeof getRedisClient>>
>;

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
  cacheEnv: string;
  accountBookId: string;
  redis: PeriodCacheRedisClient;
}): Promise<string> {
  const generationKey = getPeriodCacheGenerationKey({
    cacheEnv: args.cacheEnv,
    accountBookId: args.accountBookId,
  });

  try {
    const generation = await args.redis.get(generationKey);
    if (generation && generation.trim().length > 0) {
      return generation.trim();
    }
  } catch (error) {
    if (!hasWarnedPeriodCacheGenerationReadFailure) {
      console.warn(
        "Failed to read period cache generation; continuing with default generation.",
        error,
      );
      hasWarnedPeriodCacheGenerationReadFailure = true;
    }
  }

  return "0";
}

export async function advancePeriodCacheGeneration(args: {
  cacheEnv: string;
  accountBookId: string;
  redis: PeriodCacheRedisClient;
}): Promise<string> {
  const generationKey = getPeriodCacheGenerationKey({
    cacheEnv: args.cacheEnv,
    accountBookId: args.accountBookId,
  });
  const nextGeneration = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  await args.redis.set(generationKey, nextGeneration);
  return nextGeneration;
}

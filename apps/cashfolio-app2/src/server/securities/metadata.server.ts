import type { SecurityMetadata } from "../../shared/securities/contracts";
import { getRedisClient } from "../../redis.server";
import {
  startReadBudget,
  checkResourceBudget,
  createUserScopedSharedWork,
} from "../resource-context.server";
import { rethrowResourceError } from "../resource-error";
import { resolveListing } from "./selection.server";
import { fetchMarketstackTicker } from "./marketstack.server";
import { readCachedMetadata, type TickerMetadata } from "./metadata-data";

const sharedMetadata = createUserScopedSharedWork<TickerMetadata>();
async function loadMetadata(
  symbol: string,
  mic: string,
): Promise<TickerMetadata> {
  const key = `securities:marketstack:metadata:v1:${encodeURIComponent(JSON.stringify([symbol, mic]))}`;
  let redis: Awaited<ReturnType<typeof getRedisClient>> = null;
  try {
    redis = await getRedisClient();
    const cached = await redis?.get(key);
    if (cached) {
      const result = readCachedMetadata(JSON.parse(cached), symbol, mic);
      checkResourceBudget();
      return result;
    }
  } catch (error) {
    rethrowResourceError(error);
    // A corrupt/unavailable cache retains bounded provider fallback.
  }
  checkResourceBudget();
  const result = await fetchMarketstackTicker(symbol, mic);
  try {
    checkResourceBudget();
    await redis?.set(key, JSON.stringify(result), { EX: 7 * 86400 });
  } catch (error) {
    rethrowResourceError(error);
    // Best-effort public reference metadata cache.
  }
  checkResourceBudget();
  return result;
}
export async function securityMetadata(input: {
  selectionToken: string;
}): Promise<SecurityMetadata> {
  startReadBudget();
  const listing = resolveListing(input.selectionToken);
  if (!listing.mic) return { listingId: listing.id, isin: null };
  const { symbol, mic } = listing;
  const result = await sharedMetadata(JSON.stringify([symbol, mic]), () =>
    loadMetadata(symbol, mic),
  );
  return { listingId: listing.id, isin: result.isin };
}

import { getValuationCacheUnits } from "@/server/valuation-cache";

export async function loadValuationCachePageData() {
  return getValuationCacheUnits({
    data: {},
  });
}

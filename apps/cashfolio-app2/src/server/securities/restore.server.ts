import type { SecurityIdentity } from "../../shared/securities/route-search";
import { searchListings } from "./discovery.server";

/** One requested page only; substring results never establish identity. */
export async function restoreSecurity(identity: SecurityIdentity) {
  const page = await searchListings({
    criteria: { query: identity.symbol, exchange: identity.mic },
    offset: 0,
    limit: 20,
  });
  return (
    page.rows.find(
      (row) => row.symbol === identity.symbol && row.mic === identity.mic,
    ) ?? null
  );
}

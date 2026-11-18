import { createId } from "@paralleldrive/cuid2";
import type { SecuritySearchCriteria } from "@/shared/securities/contracts";
import type { SecuritiesDataSource } from "../types";
import { listings } from "./fixtures";
export function createFixtureSource(
  criteria: SecuritySearchCriteria,
): SecuritiesDataSource {
  const query = criteria.query.trim().toLowerCase();
  const rows = listings.filter(
    (row) =>
      (!criteria.exchange || row.mic === criteria.exchange) &&
      (row.name.toLowerCase().includes(query) ||
        row.symbol.toLowerCase().includes(query)),
  );
  return {
    key: createId(),
    async loadPage({ offset, limit }, signal) {
      signal.throwIfAborted();
      return {
        rows: rows.slice(offset, offset + limit),
        totalCount: rows.length,
      };
    },
  };
}

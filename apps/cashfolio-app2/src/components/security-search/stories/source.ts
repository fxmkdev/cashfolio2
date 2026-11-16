import { createId } from "@paralleldrive/cuid2";
import {
  getExchangeLabel,
  getHistoryLabel,
  type SecuritySearchCriteria,
  type TextFilter,
} from "@/shared/securities/contracts";
import type { SecuritiesDataSource } from "../types";
import { listings } from "./fixtures";
function matches(value: string, filter?: TextFilter) {
  if (!filter) return true;
  const text = value.toLowerCase(),
    needle = filter.value.toLowerCase();
  switch (filter.operation) {
    case "equals":
      return text === needle;
    case "notEqual":
      return text !== needle;
    case "notContains":
      return !text.includes(needle);
    case "startsWith":
      return text.startsWith(needle);
    case "endsWith":
      return text.endsWith(needle);
    default:
      return text.includes(needle);
  }
}
export function createFixtureSource(
  criteria: SecuritySearchCriteria,
): SecuritiesDataSource {
  const query = criteria.query.trim().toLowerCase();
  const base = listings.filter(
    (row) =>
      (!criteria.exchange || row.mic === criteria.exchange) &&
      (row.name.toLowerCase().includes(query) ||
        row.symbol.toLowerCase().includes(query)),
  );
  return {
    key: createId(),
    async loadFilterOptions(signal) {
      signal.throwIfAborted();
      return {
        exchange: [...new Set(base.map(getExchangeLabel))].sort(),
        country: [
          ...new Set(base.map((row) => row.country ?? "Unknown")),
        ].sort(),
        hasHistory: [
          ...new Set(base.map((row) => getHistoryLabel(row.hasHistory))),
        ].sort(),
      };
    },
    async loadPage({ filters, sorts, offset, limit }, signal) {
      signal.throwIfAborted();
      const filtered = base.filter(
        (row) =>
          matches(row.name, filters.name) &&
          matches(row.symbol, filters.symbol) &&
          (!filters.exchange ||
            filters.exchange.includes(getExchangeLabel(row))) &&
          (!filters.country ||
            filters.country.includes(row.country ?? "Unknown")) &&
          (!filters.hasHistory ||
            filters.hasHistory.includes(getHistoryLabel(row.hasHistory))),
      );
      filtered.sort((a, b) => {
        for (const { field, direction } of sorts) {
          const read = (row: typeof a) =>
            field === "exchange"
              ? getExchangeLabel(row)
              : String(row[field] ?? "");
          const order = read(a).localeCompare(read(b));
          if (order) return direction === "asc" ? order : -order;
        }
        return 0;
      });
      return {
        version: "fixture",
        rows: filtered.slice(offset, offset + limit),
        totalCount: base.length,
        filteredCount: filtered.length,
      };
    },
  };
}

import {
  assertRecord,
  requireStringField,
  requireEnumField,
} from "../input-validation";
import {
  SECURITY_COLUMNS,
  type SecuritiesScope,
  type SecuritiesQuery,
  type SecuritiesFilters,
  type TextFilter,
} from "../../shared/securities/contracts";
const operations: TextFilter["operation"][] = [
  "contains",
  "notContains",
  "equals",
  "notEqual",
  "startsWith",
  "endsWith",
];
function boundedText(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max)
    throw new Error("Invalid securities text input.");
  return value.trim();
}
export function readScope(value: unknown): SecuritiesScope {
  assertRecord(value);
  assertRecord(value.criteria);
  const mic =
    value.criteria.exchange == null
      ? null
      : boundedText(value.criteria.exchange, 4);
  if (mic !== null && !/^[A-Z0-9]{4}$/.test(mic))
    throw new Error("Invalid securities exchange MIC.");
  return {
    version: requireStringField(value, "version"),
    criteria: {
      query: boundedText(value.criteria.query, 255),
      exchange: mic,
    },
  };
}
export function readQuery(value: unknown): SecuritiesQuery {
  const scope = readScope(value);
  assertRecord(value);
  if (
    !Number.isSafeInteger(value.offset) ||
    (value.offset as number) < 0 ||
    (value.offset as number) > 2_147_483_647 ||
    value.limit !== 20
  )
    throw new Error("Invalid securities pagination.");
  assertRecord(value.filters);
  const filters: SecuritiesFilters = {};
  for (const key of ["name", "symbol"] as const) {
    const filter = value.filters[key];
    if (filter === undefined) continue;
    assertRecord(filter);
    filters[key] = {
      operation: requireEnumField(filter, "operation", operations),
      value: boundedText(filter.value, 255),
    };
  }
  for (const key of ["exchange", "country", "hasHistory"] as const) {
    const values = value.filters[key];
    if (values === undefined) continue;
    if (!Array.isArray(values) || values.length > 5000)
      throw new Error("Invalid securities set filter.");
    filters[key] = [...new Set(values.map((v) => boundedText(v, 300)))];
    if (
      key === "hasHistory" &&
      filters[key]!.some(
        (v) => !["Available", "Unavailable", "Unknown"].includes(v),
      )
    )
      throw new Error("Invalid price availability filter.");
  }
  if (!Array.isArray(value.sorts) || value.sorts.length > 5)
    throw new Error("Invalid securities sorting.");
  const sorts = value.sorts.map((sort: unknown) => {
    assertRecord(sort);
    return {
      field: requireEnumField(sort, "field", SECURITY_COLUMNS),
      direction: requireEnumField(sort, "direction", ["asc", "desc"] as const),
    };
  });
  return {
    ...scope,
    offset: value.offset as number,
    limit: 20,
    filters,
    sorts,
  };
}
export function readSelection(value: unknown) {
  assertRecord(value);
  return {
    version: requireStringField(value, "version"),
    id: requireStringField(value, "id"),
  };
}

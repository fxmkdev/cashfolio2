import { assertRecord } from "../input-validation";
import type { SecuritiesQuery } from "../../shared/securities/contracts";

export function readQuery(value: unknown): SecuritiesQuery {
  assertRecord(value);
  assertRecord(value.criteria);
  if (
    Object.keys(value.criteria).some(
      (key) => !["query", "exchange"].includes(key),
    )
  )
    throw new Error("Unsupported securities search criteria.");
  if (
    Object.keys(value).some(
      (key) => !["criteria", "offset", "limit"].includes(key),
    )
  )
    throw new Error("Unsupported securities search options. Search again.");
  const { query, exchange } = value.criteria;
  if (typeof query !== "string" || query.length > 255)
    throw new Error("Invalid securities text input.");
  if (
    exchange !== null &&
    (typeof exchange !== "string" || !/^[A-Za-z0-9._-]{1,64}$/.test(exchange))
  )
    throw new Error("Invalid securities exchange identifier.");
  if (
    !Number.isSafeInteger(value.offset) ||
    (value.offset as number) < 0 ||
    (value.offset as number) > 2_147_483_647 ||
    (value.offset as number) % 20 !== 0 ||
    value.limit !== 20
  )
    throw new Error("Invalid securities pagination.");
  return {
    criteria: { query: query.trim(), exchange },
    offset: value.offset as number,
    limit: 20,
  };
}

export function readSelection(value: unknown): { selectionToken: string } {
  assertRecord(value);
  if (
    typeof value.selectionToken !== "string" ||
    !value.selectionToken ||
    value.selectionToken.length > 4096
  )
    throw new Error("Invalid listing reference. Search again.");
  return { selectionToken: value.selectionToken };
}

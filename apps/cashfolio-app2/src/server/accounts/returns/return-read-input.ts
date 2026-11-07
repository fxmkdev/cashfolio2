import type { AccountReturnTarget } from "../../../shared/account-returns";
import {
  assertRecord,
  optionalField,
  requireBooleanField,
  requireEnumField,
  requireStringField,
  requireTextField,
} from "../../input-validation";
import { readAccountBookInput } from "../../read-input-validation";
import { assertLength } from "../../../shared/resource-limits";

function readGroupId(data: Record<string, unknown>): string {
  if (typeof data.id !== "string" || !data.id.trim())
    throw new Error("id is required.");
  // Display IDs combine encoded class/unit identities and Archived wrappers.
  assertLength(data.id, 2048, "Group identifier");
  return data.id;
}

export function readAccountReturnScope(data: unknown) {
  assertRecord(data);
  return {
    ...readAccountBookInput(data),
    accountState: requireEnumField(data, "accountState", [
      "active",
      "inactive",
      "all",
    ] as const),
    grouping: requireEnumField(data, "grouping", [
      "accountStructure",
      "assetClass",
    ] as const),
  };
}
export function readAccountReturnDetailsInput(data: unknown) {
  const scope = readAccountReturnScope(data);
  assertRecord(data);
  assertRecord(data.target);
  const kind = requireEnumField(data.target, "kind", [
    "account",
    "group",
    "total",
  ] as const);
  const target: AccountReturnTarget =
    kind === "total"
      ? { kind }
      : {
          kind,
          id:
            kind === "group"
              ? readGroupId(data.target)
              : requireStringField(data.target, "id"),
        };
  const period = optionalField(data, "period", requireTextField);
  if (period && kind !== "account")
    throw new Error(
      "Period selection is supported for individual accounts only.",
    );
  return {
    ...scope,
    target,
    period,
    includeDetails:
      optionalField(data, "includeDetails", requireBooleanField) ?? false,
  };
}

import { AccountType, EquityAccountSubtype } from "../../.prisma-client/enums";
import {
  assertRecord,
  optionalField,
  requireBooleanField,
  requireEnumField,
  requireTextField,
} from "../input-validation";
import {
  readAccountBookInput,
  readAccountInput,
} from "../read-input-validation";

export function readAccountSelectorsInput(data: unknown) {
  assertRecord(data);
  return {
    ...readAccountBookInput(data),
    accountState: optionalField(data, "accountState", (record, field) =>
      requireEnumField(record, field, ["active", "inactive"] as const),
    ),
  };
}

export function readAccountsScopeInput(data: unknown) {
  assertRecord(data);
  return {
    ...readAccountBookInput(data),
    type: optionalField(data, "type", (record, field) =>
      requireEnumField(record, field, Object.values(AccountType)),
    ),
    equityAccountSubtype: optionalField(
      data,
      "equityAccountSubtype",
      (record, field) =>
        requireEnumField(record, field, Object.values(EquityAccountSubtype)),
    ),
    accountState: optionalField(data, "accountState", (record, field) =>
      requireEnumField(record, field, ["active", "inactive", "all"] as const),
    ),
  };
}

export function readAccountTreeInput(data: unknown) {
  assertRecord(data);
  return {
    ...readAccountsScopeInput(data),
    includeReferenceBalances: optionalField(
      data,
      "includeReferenceBalances",
      requireBooleanField,
    ),
    includeActionAvailability: optionalField(
      data,
      "includeActionAvailability",
      requireBooleanField,
    ),
  };
}

export function readAccountGainLossInput(data: unknown) {
  assertRecord(data);
  return {
    ...readAccountInput(data),
    period: optionalField(data, "period", requireTextField),
    includeDetails: optionalField(data, "includeDetails", requireBooleanField),
  };
}

export function readAccountGainLossScopeInput(data: unknown) {
  assertRecord(data);
  return {
    ...readAccountBookInput(data),
    type: requireEnumField(
      data,
      "type",
      ["BALANCE"] as const,
      "Invalid account G/L scope",
    ),
    accountState: requireEnumField(
      data,
      "accountState",
      ["active", "inactive", "all"] as const,
      "Invalid account G/L scope",
    ),
  };
}

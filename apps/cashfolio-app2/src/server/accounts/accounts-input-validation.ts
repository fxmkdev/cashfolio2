import {
  AccountTrackingMethod,
  AssetClass,
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import { readStatementImportCsvFormat } from "../../shared/statement-import-csv-format";
import {
  assertRecord,
  nullableOptionalField,
  optionalField,
  requireArrayField,
  requireBooleanField,
  requireEnumField,
  requireIntegerField,
  requireNumberField,
  requireStringField,
  requireTextField,
} from "../input-validation";
import type { AccountGroupInput, AccountInput } from "./accounts-types";

function readCommonFields(data: Record<string, unknown>) {
  return {
    accountBookId: requireStringField(
      data,
      "accountBookId",
      "Account book id is required.",
    ),
    name: requireStringField(data, "name", "Name is required"),
    type: requireEnumField(data, "type", Object.values(AccountType)),
    equityAccountSubtype: optionalField(
      data,
      "equityAccountSubtype",
      (record, field) =>
        requireEnumField(record, field, Object.values(EquityAccountSubtype)),
    ),
    sortOrder: optionalField(data, "sortOrder", requireIntegerField),
    isCashAccount: optionalField(data, "isCashAccount", requireBooleanField),
  };
}

export function validateAccountMutationInput(data: unknown): AccountInput {
  assertRecord(data);
  const commonFields = readCommonFields(data);
  const openingBalance = nullableOptionalField(
    data,
    "openingBalance",
    requireNumberField,
  );
  const csv = data.statementImportCsvFormat;
  const parsedCsv =
    csv === undefined ? undefined : readStatementImportCsvFormat(csv);
  if (parsedCsv?.errors.length) {
    throw new Error(parsedCsv.errors[0]);
  }
  return {
    ...commonFields,
    trackingMethod: optionalField(data, "trackingMethod", (record, field) =>
      requireEnumField(record, field, Object.values(AccountTrackingMethod)),
    ),
    assetClass: nullableOptionalField(data, "assetClass", (record, field) =>
      requireEnumField(record, field, Object.values(AssetClass)),
    ),
    groupId: nullableOptionalField(data, "groupId", requireStringField),
    unit: optionalField(data, "unit", (record, field) =>
      requireEnumField(record, field, Object.values(Unit)),
    ),
    currency: optionalField(data, "currency", requireTextField),
    cryptocurrency: optionalField(data, "cryptocurrency", requireTextField),
    symbol: optionalField(data, "symbol", requireTextField),
    tradeCurrency: optionalField(data, "tradeCurrency", requireTextField),
    statementImportCsvFormat: parsedCsv?.format,
    openingBalance,
  };
}

export function validateAccountUpdateInput(
  data: unknown,
): AccountInput & { id: string } {
  assertRecord(data);
  const id = requireStringField(data, "id", "Account id is required.");
  return { ...validateAccountMutationInput(data), id };
}

export function validateAccountGroupMutationInput(
  data: unknown,
): AccountGroupInput {
  assertRecord(data);
  return {
    ...readCommonFields(data),
    parentGroupId: nullableOptionalField(
      data,
      "parentGroupId",
      requireStringField,
    ),
    isActive: optionalField(data, "isActive", requireBooleanField),
  };
}

export function validateAccountGroupUpdateInput(
  data: unknown,
): AccountGroupInput & { id: string } {
  assertRecord(data);
  const id = requireStringField(data, "id", "Account group id is required.");
  return { ...validateAccountGroupMutationInput(data), id };
}

export function validateAccountBookNodeIdInput(data: unknown): {
  id: string;
  accountBookId: string;
} {
  assertRecord(data);
  return {
    id: requireStringField(data, "id", "Node id is required."),
    accountBookId: requireStringField(
      data,
      "accountBookId",
      "Account book id is required.",
    ),
  };
}

export function validateReorderAccountTreeItemsInput(data: unknown) {
  assertRecord(data);
  const accountBookId = requireStringField(
    data,
    "accountBookId",
    "Account book id is required.",
  );
  const updates = requireArrayField(data, "updates", "Updates are required.");
  return {
    accountBookId,
    updates: Array.from(updates, (update) => {
      assertRecord(update, "Reorder update must be an object.");
      return {
        id: requireStringField(update, "id", "Node id is required."),
        nodeType: requireEnumField(
          update,
          "nodeType",
          ["account", "accountGroup"] as const,
          "Node type is invalid.",
        ),
        sortOrder: requireIntegerField(update, "sortOrder"),
      };
    }),
  };
}

export function validateSetAccountsAssetClassInput(data: unknown): {
  accountBookId: string;
  accountIds: string[];
  assetClass: AssetClass | null;
} {
  assertRecord(data);
  return {
    accountBookId: requireStringField(data, "accountBookId"),
    accountIds: readAccountIds(data, "accountIds"),
    assetClass:
      data.assetClass === null
        ? null
        : requireEnumField(data, "assetClass", Object.values(AssetClass)),
  };
}

function readAccountIds(
  data: Record<string, unknown>,
  field: string,
): string[] {
  const ids = requireArrayField(data, field);
  if (!ids.length) throw new Error("Select at least one account.");
  return [
    ...new Set(
      Array.from(ids, (id) =>
        requireStringField(
          { id },
          "id",
          "Each account id must be a nonempty string.",
        ),
      ),
    ),
  ];
}

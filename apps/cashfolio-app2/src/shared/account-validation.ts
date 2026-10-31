import { RESOURCE_LIMITS } from "./resource-limits";
import type { AccountType, Unit } from "../.prisma-client/enums";
import type {
  AccountGroupInput,
  AccountInput,
} from "./account-validation-types";
import { readStatementImportCsvFormat } from "./statement-import-csv-format";

// Per-field validators return an error message string or null if valid.

export function validateAccountName(
  name?: string,
  siblingNames?: string[],
): string | null {
  if (!name) return "Name is required";
  if (name.length > RESOURCE_LIMITS.name)
    return "Name cannot exceed 255 characters.";
  if (
    siblingNames &&
    siblingNames.some(
      (n) => n.localeCompare(name, undefined, { sensitivity: "accent" }) === 0,
    )
  ) {
    return "An account with this name already exists in this group";
  }
  return null;
}

export function validateAccountGroupId(_groupId?: string): string | null {
  return null;
}

function isBalanceAccountType(type?: AccountType): boolean {
  return type === "BALANCE";
}

function hasEquitySubtype(
  subtype:
    | AccountInput["equityAccountSubtype"]
    | AccountGroupInput["equityAccountSubtype"],
): boolean {
  return subtype != null;
}

export function validateEquitySubtypeTypeCombination(
  type?: AccountType,
  equityAccountSubtype?: AccountInput["equityAccountSubtype"],
): string | null {
  if (!hasEquitySubtype(equityAccountSubtype)) return null;
  if (type === "EQUITY") return null;
  return "Equity subtype is only allowed for equity accounts";
}

export function validateGroupEquitySubtypeTypeCombination(
  type?: AccountType,
  equityAccountSubtype?: AccountGroupInput["equityAccountSubtype"],
): string | null {
  if (!hasEquitySubtype(equityAccountSubtype)) return null;
  if (type === "EQUITY") return null;
  return "Equity subtype is only allowed for equity groups";
}

export function validateAccountUnit(
  unit?: Unit,
  type?: AccountType,
): string | null {
  if (!isBalanceAccountType(type)) return null;
  return unit ? null : "Unit is required";
}

function validateEquityAccountUnitMetadata(data: AccountInput): string | null {
  if (
    data.type === "EQUITY" &&
    [
      data.unit,
      data.currency,
      data.cryptocurrency,
      data.symbol,
      data.tradeCurrency,
    ].some((value) => value != null)
  ) {
    return "Unit metadata is only allowed for balance accounts";
  }
  return null;
}

export function validateAccountAssetClass(
  assetClass: AccountInput["assetClass"],
  type?: AccountType,
): string | null {
  return assetClass == null || isBalanceAccountType(type)
    ? null
    : "Asset class is only allowed for balance accounts";
}

export function validateAccountCurrency(
  currency?: string,
  unit?: Unit,
  type?: AccountType,
): string | null {
  if (!isBalanceAccountType(type) || unit !== "CURRENCY") return null;
  return currency && currency.length > RESOURCE_LIMITS.unitCode
    ? "Currency cannot exceed 64 characters."
    : currency
      ? null
      : "Currency is required";
}

export function validateAccountCryptocurrency(
  cryptocurrency?: string,
  unit?: Unit,
  type?: AccountType,
): string | null {
  if (!isBalanceAccountType(type) || unit !== "CRYPTOCURRENCY") return null;
  return cryptocurrency && cryptocurrency.length > RESOURCE_LIMITS.unitCode
    ? "Cryptocurrency cannot exceed 64 characters."
    : cryptocurrency
      ? null
      : "Cryptocurrency is required";
}

export function validateAccountSymbol(
  symbol?: string,
  unit?: Unit,
  type?: AccountType,
): string | null {
  if (!isBalanceAccountType(type) || unit !== "SECURITY") return null;
  return symbol && symbol.length > RESOURCE_LIMITS.unitCode
    ? "Symbol cannot exceed 64 characters."
    : symbol
      ? null
      : "Symbol is required";
}

export function validateAccountTradeCurrency(
  tradeCurrency?: string,
  unit?: Unit,
  type?: AccountType,
): string | null {
  if (!isBalanceAccountType(type) || unit !== "SECURITY") return null;
  return tradeCurrency && tradeCurrency.length > RESOURCE_LIMITS.unitCode
    ? "Trade currency cannot exceed 64 characters."
    : tradeCurrency
      ? null
      : "Trade currency is required";
}

export function validateAccountStatementImportCsvFormat(
  statementImportCsvFormat: AccountInput["statementImportCsvFormat"],
  type?: AccountType,
): string | null {
  if (statementImportCsvFormat == null) return null;
  if (!isBalanceAccountType(type)) {
    return "Statement import CSV format is only available for accounts";
  }

  const result = readStatementImportCsvFormat(statementImportCsvFormat);
  return result.errors[0] ?? null;
}

export function validateAccountCashAccountFlag(
  isCashAccount?: boolean,
  unit?: Unit,
  type?: AccountType,
): string | null {
  if (!isCashAccount) return null;
  if (isBalanceAccountType(type) && unit === "CURRENCY") return null;
  return "Only currency accounts can be included in cash flow";
}

export function validateAccountGroupCashAccountFlag(
  isCashAccount?: boolean,
  type?: AccountType,
): string | null {
  if (!isCashAccount) return null;
  if (isBalanceAccountType(type)) return null;
  return "Only account groups can be included in cash flow";
}

export function validateAccountGroupName(
  name?: string,
  siblingNames?: string[],
): string | null {
  if (!name) return "Name is required";
  if (name.length > RESOURCE_LIMITS.name)
    return "Name cannot exceed 255 characters.";
  if (
    siblingNames &&
    siblingNames.some(
      (n) => n.localeCompare(name, undefined, { sensitivity: "accent" }) === 0,
    )
  ) {
    return "A group with this name already exists";
  }
  return null;
}

export function validateAccountGroupParentGroupId(
  parentGroupId?: string,
  options?: {
    editingId?: string;
    descendantGroupIds?: Set<string>;
  },
): string | null {
  const editingId = options?.editingId;
  if (!parentGroupId || !editingId) return null;
  if (parentGroupId === editingId) {
    return "A group cannot be its own parent";
  }
  if (options.descendantGroupIds?.has(parentGroupId)) {
    return "A group cannot be moved under one of its sub-groups";
  }
  return null;
}

// Full-input validators for server-side use. Throw on first error.

export function validateAccountInput(
  data: AccountInput,
  siblingNames?: string[],
): void {
  const errors = [
    validateAccountName(data.name, siblingNames),
    validateEquitySubtypeTypeCombination(data.type, data.equityAccountSubtype),
    validateEquityAccountUnitMetadata(data),
    validateAccountUnit(data.unit, data.type),
    validateAccountAssetClass(data.assetClass, data.type),
    validateAccountCurrency(data.currency, data.unit, data.type),
    validateAccountCryptocurrency(data.cryptocurrency, data.unit, data.type),
    validateAccountSymbol(data.symbol, data.unit, data.type),
    validateAccountTradeCurrency(data.tradeCurrency, data.unit, data.type),
    validateAccountStatementImportCsvFormat(
      data.statementImportCsvFormat,
      data.type,
    ),
    validateAccountCashAccountFlag(data.isCashAccount, data.unit, data.type),
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(errors[0]!);
  }
}

export function validateAccountGroupInput(
  data: AccountGroupInput,
  siblingNames?: string[],
): void {
  const errors = [
    validateAccountGroupName(data.name, siblingNames),
    validateGroupEquitySubtypeTypeCombination(
      data.type,
      data.equityAccountSubtype,
    ),
    validateAccountGroupCashAccountFlag(data.isCashAccount, data.type),
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(errors[0]!);
  }
}

import type { AccountType, Unit } from "../.prisma-client/enums";
import type {
  AccountGroupInput,
  AccountInput,
} from "./account-validation-types";

// Per-field validators return an error message string or null if valid.

export function validateAccountName(
  name?: string,
  siblingNames?: string[],
): string | null {
  if (!name) return "Name is required";
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

function isAssetOrLiability(type?: AccountType): boolean {
  return type === "ASSET" || type === "LIABILITY";
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
  if (!isAssetOrLiability(type)) return null;
  return unit ? null : "Unit is required";
}

export function validateAccountCurrency(
  currency?: string,
  unit?: Unit,
  type?: AccountType,
): string | null {
  if (!isAssetOrLiability(type) || unit !== "CURRENCY") return null;
  return currency ? null : "Currency is required";
}

export function validateAccountCryptocurrency(
  cryptocurrency?: string,
  unit?: Unit,
  type?: AccountType,
): string | null {
  if (!isAssetOrLiability(type) || unit !== "CRYPTOCURRENCY") return null;
  return cryptocurrency ? null : "Cryptocurrency is required";
}

export function validateAccountSymbol(
  symbol?: string,
  unit?: Unit,
  type?: AccountType,
): string | null {
  if (!isAssetOrLiability(type) || unit !== "SECURITY") return null;
  return symbol ? null : "Symbol is required";
}

export function validateAccountTradeCurrency(
  tradeCurrency?: string,
  unit?: Unit,
  type?: AccountType,
): string | null {
  if (!isAssetOrLiability(type) || unit !== "SECURITY") return null;
  return tradeCurrency ? null : "Trade Currency is required";
}

export function validateAccountGroupName(
  name?: string,
  siblingNames?: string[],
): string | null {
  if (!name) return "Name is required";
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
    validateAccountUnit(data.unit, data.type),
    validateAccountCurrency(data.currency, data.unit, data.type),
    validateAccountCryptocurrency(data.cryptocurrency, data.unit, data.type),
    validateAccountSymbol(data.symbol, data.unit, data.type),
    validateAccountTradeCurrency(data.tradeCurrency, data.unit, data.type),
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
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(errors[0]!);
  }
}

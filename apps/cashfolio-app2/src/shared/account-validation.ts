import type { AccountType, Unit } from "../.prisma-client/enums";
import type { AccountInput, AccountGroupInput } from "../server/accounts";

// Per-field validators return an error message string or null if valid.

export function validateAccountName(name?: string): string | null {
  return name ? null : "Name is required";
}

export function validateAccountGroupId(groupId?: string): string | null {
  return groupId ? null : "Group is required";
}

function isAssetOrLiability(type?: AccountType): boolean {
  return type === "ASSET" || type === "LIABILITY";
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

export function validateAccountGroupName(name?: string): string | null {
  return name ? null : "Name is required";
}

export function validateAccountGroupParentGroupId(
  parentGroupId?: string,
): string | null {
  return parentGroupId ? null : "Parent Group is required";
}

// Full-input validators for server-side use. Throw on first error.

export function validateAccountInput(data: AccountInput): void {
  const errors = [
    validateAccountName(data.name),
    validateAccountGroupId(data.groupId),
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

export function validateAccountGroupInput(data: AccountGroupInput): void {
  const errors = [
    validateAccountGroupName(data.name),
    validateAccountGroupParentGroupId(data.parentGroupId),
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(errors[0]!);
  }
}

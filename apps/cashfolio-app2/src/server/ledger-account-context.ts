import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import type { LedgerDerivedAccount } from "./ledger-derivation";

export function parseLedgerAccountContextFromInput(data: {
  accountType?: unknown;
  accountEquityAccountSubtype?: unknown;
  accountUnit?: unknown;
  accountCurrency?: unknown;
  accountCryptocurrency?: unknown;
  accountSymbol?: unknown;
  accountTradeCurrency?: unknown;
}): LedgerDerivedAccount | null {
  const type = parseEnumValue(AccountType, data.accountType);
  if (!type) {
    return null;
  }

  const equityAccountSubtype = parseNullableEnumValue(
    EquityAccountSubtype,
    data.accountEquityAccountSubtype,
  );
  const unit = parseNullableEnumValue(Unit, data.accountUnit);
  const currency = parseNullableString(data.accountCurrency);
  const cryptocurrency = parseNullableString(data.accountCryptocurrency);
  const symbol = parseNullableString(data.accountSymbol);
  const tradeCurrency = parseNullableString(data.accountTradeCurrency);

  if (
    equityAccountSubtype === undefined ||
    unit === undefined ||
    currency === undefined ||
    cryptocurrency === undefined ||
    symbol === undefined ||
    tradeCurrency === undefined
  ) {
    return null;
  }

  return {
    type,
    equityAccountSubtype,
    unit,
    currency,
    cryptocurrency,
    symbol,
    tradeCurrency,
  };
}

function parseEnumValue<T extends string>(
  enumObject: Record<string, T>,
  value: unknown,
): T | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return Object.values(enumObject).includes(value as T)
    ? (value as T)
    : undefined;
}

function parseNullableEnumValue<T extends string>(
  enumObject: Record<string, T>,
  value: unknown,
): T | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return parseEnumValue(enumObject, value);
}

function parseNullableString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? value : undefined;
}

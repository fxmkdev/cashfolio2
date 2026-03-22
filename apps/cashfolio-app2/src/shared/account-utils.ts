import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";

export function getTypeLabel(
  type: AccountType,
  equityAccountSubtype: EquityAccountSubtype | null,
): string {
  if (type === AccountType.ASSET) return "Asset";
  if (type === AccountType.LIABILITY) return "Liability";
  if (equityAccountSubtype === EquityAccountSubtype.INCOME) return "Income";
  if (equityAccountSubtype === EquityAccountSubtype.EXPENSE) return "Expense";
  if (equityAccountSubtype === EquityAccountSubtype.GAIN_LOSS)
    return "Gain/Loss";
  return "Accounts";
}

export function isIncomeAccount(
  acct:
    | { type: AccountType; equityAccountSubtype?: EquityAccountSubtype | null }
    | undefined,
): boolean {
  return (
    acct?.type === AccountType.EQUITY &&
    acct?.equityAccountSubtype === EquityAccountSubtype.INCOME
  );
}

export function isExpenseAccount(
  acct:
    | { type: AccountType; equityAccountSubtype?: EquityAccountSubtype | null }
    | undefined,
): boolean {
  return (
    acct?.type === AccountType.EQUITY &&
    acct?.equityAccountSubtype === EquityAccountSubtype.EXPENSE
  );
}

export function getUnitIdentifier(booking: {
  unit: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
}): string {
  switch (booking.unit) {
    case Unit.CURRENCY:
      return `currency:${booking.currency}`;
    case Unit.CRYPTOCURRENCY:
      return `crypto:${booking.cryptocurrency}`;
    case Unit.SECURITY:
      // Security unit identity is symbol-based; trade currency affects pricing only.
      return `security:${booking.symbol}`;
  }
}

export function getSimpleTransactionUnitIdentifier(account: {
  unit: Unit | null;
  currency?: string | null;
  cryptocurrency?: string | null;
  symbol?: string | null;
  tradeCurrency?: string | null;
}): string | null {
  if (!account.unit) return null;

  if (account.unit === Unit.CURRENCY) {
    return account.currency ? `currency:${account.currency}` : null;
  }

  if (account.unit === Unit.CRYPTOCURRENCY) {
    return account.cryptocurrency ? `crypto:${account.cryptocurrency}` : null;
  }

  if (!account.symbol || !account.tradeCurrency) return null;
  // Security compatibility is symbol-based; tradeCurrency is required metadata.
  return `security:${account.symbol}`;
}

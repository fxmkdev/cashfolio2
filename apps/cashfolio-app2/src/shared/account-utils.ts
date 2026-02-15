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
      return `security:${booking.symbol}`;
  }
}

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

type UnitIdentifierSource = {
  unit: Unit | null;
  currency?: string | null;
  cryptocurrency?: string | null;
  symbol?: string | null;
  tradeCurrency?: string | null;
};

function getCompatibleUnitIdentifier(
  source: UnitIdentifierSource,
): string | null {
  if (!source.unit) return null;

  if (source.unit === Unit.CURRENCY) {
    return source.currency ? `currency:${source.currency}` : null;
  }

  if (source.unit === Unit.CRYPTOCURRENCY) {
    return source.cryptocurrency ? `crypto:${source.cryptocurrency}` : null;
  }

  if (!source.symbol || !source.tradeCurrency) return null;
  // Security compatibility is symbol-based; tradeCurrency is required metadata.
  return `security:${source.symbol}`;
}

export function getAccountUnitIdentifier(
  account: UnitIdentifierSource,
): string | null {
  return getCompatibleUnitIdentifier(account);
}

export function getBookingUnitIdentifier(booking: {
  unit: Unit;
  currency?: string | null;
  cryptocurrency?: string | null;
  symbol?: string | null;
  tradeCurrency?: string | null;
}): string | null {
  return getCompatibleUnitIdentifier(booking);
}

export function isBookingUnitCompatibleWithAccount(
  booking: {
    unit: Unit;
    currency?: string | null;
    cryptocurrency?: string | null;
    symbol?: string | null;
    tradeCurrency?: string | null;
  },
  account: UnitIdentifierSource,
): boolean {
  const bookingIdentifier = getBookingUnitIdentifier(booking);
  if (!bookingIdentifier) return false;

  if (!account.unit) return true;

  const accountIdentifier = getAccountUnitIdentifier(account);
  if (!accountIdentifier) return false;
  return bookingIdentifier === accountIdentifier;
}

export function getSimpleTransactionUnitIdentifier(
  account: UnitIdentifierSource,
): string | null {
  return getAccountUnitIdentifier(account);
}

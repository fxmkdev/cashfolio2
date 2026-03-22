import { format } from "date-fns";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import type { AccountOption } from "../../components/edit-transaction-modal";
import {
  getSimpleTransactionUnitIdentifier,
  getTypeLabel,
} from "../../shared/account-utils";
import type {
  LedgerAccount,
  LedgerAccountOptionSource,
  LedgerBookings,
  LedgerRow,
} from "./ledger-page-types";

function shouldNegate(
  type: AccountType,
  equityAccountSubtype: EquityAccountSubtype | null,
): boolean {
  return (
    type === AccountType.LIABILITY ||
    (type === AccountType.EQUITY &&
      equityAccountSubtype !== EquityAccountSubtype.EXPENSE)
  );
}

export function getUnitLabel(account: {
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  tradeCurrency: string | null;
}): string | null {
  if (!account.unit) return null;
  switch (account.unit) {
    case Unit.CURRENCY:
      return account.currency;
    case Unit.SECURITY:
      return account.tradeCurrency;
    case Unit.CRYPTOCURRENCY:
      return account.cryptocurrency;
  }
}

function toAccountOption(account: LedgerAccountOptionSource): AccountOption {
  return {
    label: [
      getTypeLabel(account.type, account.equityAccountSubtype),
      account.groupPath,
      account.name,
    ]
      .filter(Boolean)
      .join(" / "),
    value: account.id,
    unit: account.unit as Unit,
    currency: account.currency,
    cryptocurrency: account.cryptocurrency,
    symbol: account.symbol,
    tradeCurrency: account.tradeCurrency,
    type: account.type as AccountType,
    equityAccountSubtype:
      account.equityAccountSubtype as EquityAccountSubtype | null,
  };
}

export function createAccountOptions(
  accounts: LedgerAccountOptionSource[],
  includeAccount: (account: LedgerAccountOptionSource) => boolean,
): AccountOption[] {
  return accounts.filter(includeAccount).map(toAccountOption);
}

export function buildLedgerRows(
  account: LedgerAccount,
  bookings: LedgerBookings,
): LedgerRow[] {
  const negate = shouldNegate(account.type, account.equityAccountSubtype);
  const isEquity = account.type === AccountType.EQUITY;
  let balance = 0;

  return bookings
    .map((booking) => {
      const rawValue = Number(booking.value);
      const value = negate ? -rawValue : rawValue;
      balance += value;

      return {
        id: booking.id,
        transactionId: booking.transactionId,
        date: format(new Date(booking.date), "dd.MM.yyyy"),
        counterpartyAccounts: booking.counterpartyAccounts,
        description: booking.description || booking.transactionDescription,
        unit: booking.unit,
        currency: booking.currency,
        cryptocurrency: booking.cryptocurrency,
        symbol: booking.symbol,
        debit: negate ? (value < 0 ? -value : null) : value > 0 ? value : null,
        credit: negate ? (value > 0 ? value : null) : value < 0 ? -value : null,
        balance: isEquity ? null : balance,
      };
    })
    .reverse();
}

export function createCurrentAccountLabel(account: LedgerAccount): string {
  return [
    getTypeLabel(account.type, account.equityAccountSubtype),
    account.groupPathSegments.join(" / "),
    account.name,
  ]
    .filter(Boolean)
    .join(" / ");
}

export function getSimpleTransactionDisabledReason(args: {
  account: LedgerAccount;
  currentSimpleUnitIdentifier: string | null;
  simpleCounterAccountOptionsLength: number;
}): string | null {
  const {
    account,
    currentSimpleUnitIdentifier,
    simpleCounterAccountOptionsLength,
  } = args;

  if (
    account.type !== AccountType.ASSET &&
    account.type !== AccountType.LIABILITY
  ) {
    return "Simple transactions are only available for asset and liability accounts.";
  }
  if (!currentSimpleUnitIdentifier) {
    return "Simple transactions require a current account with a complete unit.";
  }
  if (simpleCounterAccountOptionsLength === 0) {
    return "No eligible account is available.";
  }
  return null;
}

export { getSimpleTransactionUnitIdentifier };

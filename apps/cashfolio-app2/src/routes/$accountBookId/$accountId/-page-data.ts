import { isSameDay } from "date-fns";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "@/.prisma-client/enums";
import {
  getUnitIdentifier,
  getSimpleTransactionUnitIdentifier,
  getTypeLabel,
} from "@/shared/account-utils";
import {
  createDisplayNumberFormatter,
  getCurrencyDecimals,
  getUnitDisplayDecimals,
} from "@/shared/unit-format";
import type { LedgerAccount } from "./-page-types";

export type LedgerAccountKindBadgeProps = {
  label: string;
  color: "green" | "red" | "yellow" | "gray";
  variant: "filled" | "light";
};

export function getLedgerAccountKindBadgeProps(account: {
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
}): LedgerAccountKindBadgeProps {
  const label = getTypeLabel(account.type, account.equityAccountSubtype);

  if (account.type === AccountType.ASSET) {
    return { label, color: "green", variant: "light" };
  }
  if (account.type === AccountType.LIABILITY) {
    return { label, color: "red", variant: "light" };
  }
  if (account.equityAccountSubtype === EquityAccountSubtype.INCOME) {
    return { label, color: "green", variant: "filled" };
  }
  if (account.equityAccountSubtype === EquityAccountSubtype.EXPENSE) {
    return { label, color: "red", variant: "filled" };
  }
  if (
    account.equityAccountSubtype === EquityAccountSubtype.GAIN_LOSS ||
    account.equityAccountSubtype === EquityAccountSubtype.OPENING_BALANCES
  ) {
    return { label, color: "yellow", variant: "light" };
  }

  return { label, color: "gray", variant: "light" };
}

export function getUnitLabel(account: {
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
}): string | null {
  if (!account.unit) return null;
  switch (account.unit) {
    case Unit.CURRENCY:
      return account.currency;
    case Unit.SECURITY:
      return account.symbol;
    case Unit.CRYPTOCURRENCY:
      return account.cryptocurrency;
  }
}

type BalanceFormatterAccount = Pick<
  LedgerAccount,
  "unit" | "currency" | "cryptocurrency" | "symbol" | "tradeCurrency"
>;

export function createLedgerBalanceFormatter(account: BalanceFormatterAccount) {
  if (account.unit === Unit.CURRENCY && account.currency) {
    const currencyFormatter = createDisplayNumberFormatter({
      locale: "en-CH",
      style: "currency",
      currency: account.currency,
      decimals: getCurrencyDecimals(account.currency),
    });

    return (value: number) => currencyFormatter.format(value);
  }

  const numberFormatter = createDisplayNumberFormatter({
    locale: "en-CH",
    decimals: getUnitDisplayDecimals({
      unit: account.unit,
      currency: account.currency,
      cryptocurrency: account.cryptocurrency,
    }),
  });
  const unitLabel = getUnitLabel(account);

  return (value: number) => {
    const formattedValue = numberFormatter.format(value);
    return unitLabel ? `${formattedValue} ${unitLabel}` : formattedValue;
  };
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

type SimpleDirection = "DEBIT" | "CREDIT";

type EditTransactionBooking = {
  date?: string;
  account?: string;
  description?: string;
  unit?: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
  debit?: number;
  credit?: number;
};

export type EditTransactionData = {
  description?: string;
  bookings?: EditTransactionBooking[];
};

export type SimpleTransactionEditInitialValues = {
  date: Date;
  description: string;
  counterAccountId: string;
  amount: number;
  direction: SimpleDirection;
};

export type SimpleTransactionEditState =
  | {
      eligible: true;
      disabledReason: null;
      initialValues: SimpleTransactionEditInitialValues;
    }
  | {
      eligible: false;
      disabledReason: string;
      initialValues: null;
    };

const TRANSACTION_BALANCE_TOLERANCE = 0.001;

function ineligible(disabledReason: string): SimpleTransactionEditState {
  return {
    eligible: false,
    disabledReason,
    initialValues: null,
  };
}

function getBookingUnitIdentifier(
  booking: EditTransactionBooking,
): string | null {
  if (!booking.unit) return null;

  if (booking.unit === Unit.CURRENCY && !booking.currency) return null;
  if (booking.unit === Unit.CRYPTOCURRENCY && !booking.cryptocurrency) {
    return null;
  }
  if (
    booking.unit === Unit.SECURITY &&
    (!booking.symbol || !booking.tradeCurrency)
  ) {
    return null;
  }

  // Security unit identity intentionally follows symbol-level identity.
  // tradeCurrency is required metadata for valuation/reporting, but it is not
  // part of the unit-compatibility identity check.
  return getUnitIdentifier({
    unit: booking.unit,
    currency: booking.currency,
    cryptocurrency: booking.cryptocurrency,
    symbol: booking.symbol,
  });
}

export function deriveSimpleTransactionEditState(args: {
  transaction: EditTransactionData;
  currentAccountId: string;
}): SimpleTransactionEditState {
  const bookings = args.transaction.bookings ?? [];

  if (bookings.length !== 2) {
    return ineligible("Simple edit requires exactly two bookings.");
  }

  const [first, second] = bookings;
  const firstUnitIdentifier = getBookingUnitIdentifier(first);
  const secondUnitIdentifier = getBookingUnitIdentifier(second);
  if (!firstUnitIdentifier || !secondUnitIdentifier) {
    return ineligible("Simple edit requires complete booking unit data.");
  }
  if (firstUnitIdentifier !== secondUnitIdentifier) {
    return ineligible(
      "Simple edit requires both bookings to use the same unit.",
    );
  }

  if (
    (first.description ?? "").trim() !== "" ||
    (second.description ?? "").trim() !== ""
  ) {
    return ineligible(
      "Simple edit only supports transactions with empty booking descriptions.",
    );
  }

  if (!first.date || !second.date) {
    return ineligible("Simple edit requires both bookings to have a date.");
  }
  const firstDate = new Date(first.date);
  const secondDate = new Date(second.date);
  if (isNaN(firstDate.getTime()) || isNaN(secondDate.getTime())) {
    return ineligible("Simple edit requires valid booking dates.");
  }
  // Booking semantics are day-granular in this app; time-of-day is not
  // significant for eligibility or editing behavior.
  if (!isSameDay(firstDate, secondDate)) {
    return ineligible(
      "Simple edit requires both bookings to have the same date.",
    );
  }

  const currentBookings = bookings.filter(
    (booking) => booking.account === args.currentAccountId,
  );
  if (currentBookings.length !== 1) {
    return ineligible(
      "Simple edit requires exactly one booking on this account.",
    );
  }
  const currentBooking = currentBookings[0];

  const counterBooking = bookings.find(
    (booking) => booking.account !== args.currentAccountId,
  );
  if (!counterBooking?.account) {
    return ineligible("Simple edit requires a distinct counter account.");
  }

  const debit = currentBooking.debit ?? 0;
  const credit = currentBooking.credit ?? 0;
  const hasDebit = debit > 0;
  const hasCredit = credit > 0;
  if (hasDebit === hasCredit) {
    return ineligible(
      "Simple edit requires exactly one non-zero side on the current account booking.",
    );
  }

  const amount = hasDebit ? debit : credit;
  if (!Number.isFinite(amount) || amount <= 0) {
    return ineligible("Simple edit requires a positive amount.");
  }

  const counterDebit = counterBooking.debit ?? 0;
  const counterCredit = counterBooking.credit ?? 0;
  const counterHasDebit = counterDebit > 0;
  const counterHasCredit = counterCredit > 0;
  if (counterHasDebit === counterHasCredit) {
    return ineligible(
      "Simple edit requires exactly one non-zero side on the counter account booking.",
    );
  }

  const counterAmount = counterHasDebit ? counterDebit : counterCredit;
  if (!Number.isFinite(counterAmount) || counterAmount <= 0) {
    return ineligible("Simple edit requires a positive counter amount.");
  }

  if (Math.abs(counterAmount - amount) > TRANSACTION_BALANCE_TOLERANCE) {
    return ineligible(
      "Simple edit requires matching amounts on both bookings.",
    );
  }

  if (hasDebit === counterHasDebit) {
    return ineligible("Simple edit requires one debit and one credit booking.");
  }

  const currentValue = hasDebit ? amount : -amount;
  const counterValue = counterHasDebit ? counterAmount : -counterAmount;
  if (Math.abs(currentValue + counterValue) > TRANSACTION_BALANCE_TOLERANCE) {
    return ineligible("Simple edit requires balanced booking values.");
  }

  return {
    eligible: true,
    disabledReason: null,
    initialValues: {
      date: firstDate,
      description: args.transaction.description ?? "",
      counterAccountId: counterBooking.account,
      amount,
      direction: hasDebit ? "DEBIT" : "CREDIT",
    },
  };
}

export { getSimpleTransactionUnitIdentifier };

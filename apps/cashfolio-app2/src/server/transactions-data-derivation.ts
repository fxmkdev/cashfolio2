import type { Money } from "../shared/money";
import { Unit } from "../.prisma-client/enums";
import { moneyAbs, moneySum, toMoney, toMoneyNumber } from "../shared/money";

export type TransactionsDerivedBooking = {
  id: string;
  date: Date;
  description: string | null;
  value: Money;
  valueInReferenceCurrency: Money | null;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  transactionId: string;
  transactionDescription: string | null;
  transactionCreatedAt: Date;
  account: {
    id: string;
    name: string;
  };
  isOpeningBalancesTransaction: boolean;
};

type TransactionsDerivedAccount = {
  id: string;
  name: string;
};

export type TransactionsDerivedBookingRow = {
  id: string;
  transactionId: string;
  bookingValue: number;
  date: string;
  account: TransactionsDerivedAccount;
  description: string;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  isOpeningBalancesTransaction: boolean;
  debit: number | null;
  credit: number | null;
  referenceDebit: number | null;
  referenceCredit: number | null;
};

export type TransactionsDerivedRow = {
  id: string;
  transactionId: string;
  date: string;
  debitAccounts: TransactionsDerivedAccount[];
  creditAccounts: TransactionsDerivedAccount[];
  description: string;
  unitIdentifiers: string[];
  originalAmount: number | null;
  originalAmountUnit: Unit | null;
  originalAmountCurrency: string | null;
  originalAmountCryptocurrency: string | null;
  referenceAmount: number | null;
  isOpeningBalancesTransaction: boolean;
  bookings: TransactionsDerivedBookingRow[];
};

function formatUtcDateLabel(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  return `${day}.${month}.${year}`;
}

function getUnitIdentifier(args: {
  booking: TransactionsDerivedBooking;
  referenceCurrency: string;
}): string | null {
  const { booking, referenceCurrency } = args;

  switch (booking.unit) {
    case Unit.CURRENCY: {
      const currency = normalizeUnitCode(booking.currency);
      if (!currency || currency === referenceCurrency) {
        return null;
      }
      return booking.currency;
    }
    case Unit.CRYPTOCURRENCY:
      return booking.cryptocurrency;
    case Unit.SECURITY:
      return booking.symbol;
    default:
      return null;
  }
}

function uniqueById(
  accounts: TransactionsDerivedAccount[],
): TransactionsDerivedAccount[] {
  const seen = new Set<string>();
  const uniqueAccounts: TransactionsDerivedAccount[] = [];

  for (const account of accounts) {
    if (seen.has(account.id)) continue;
    seen.add(account.id);
    uniqueAccounts.push(account);
  }

  return uniqueAccounts;
}

function uniqueStrings(values: Array<string | null>): string[] {
  const seen = new Set<string>();
  const uniqueValues: string[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    uniqueValues.push(value);
  }

  return uniqueValues;
}

function normalizeUnitCode(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : null;
}

function getNonReferenceUnitKey(args: {
  booking: TransactionsDerivedBooking;
  referenceCurrency: string;
}): string | null {
  const { booking, referenceCurrency } = args;

  switch (booking.unit) {
    case Unit.CURRENCY: {
      const currency = normalizeUnitCode(booking.currency);
      if (!currency || currency === referenceCurrency) {
        return null;
      }
      return `currency:${currency}`;
    }
    case Unit.CRYPTOCURRENCY: {
      const cryptocurrency = normalizeUnitCode(booking.cryptocurrency);
      return cryptocurrency ? `cryptocurrency:${cryptocurrency}` : null;
    }
    case Unit.SECURITY: {
      const symbol = normalizeUnitCode(booking.symbol);
      return symbol ? `security:${symbol}` : null;
    }
    default:
      return null;
  }
}

function splitDebitCredit(value: Money): {
  debit: number | null;
  credit: number | null;
} {
  const moneyValue = toMoney(value);
  const sign = moneyValue.comparedTo(0);

  if (sign > 0) {
    return { debit: toMoneyNumber(moneyValue), credit: null };
  }
  if (sign < 0) {
    return { debit: null, credit: toMoneyNumber(moneyValue.neg()) };
  }
  return { debit: null, credit: null };
}

function toBookingRow(
  booking: TransactionsDerivedBooking,
): TransactionsDerivedBookingRow {
  const { debit, credit } = splitDebitCredit(booking.value);
  const referenceValues =
    booking.valueInReferenceCurrency == null
      ? { debit: null, credit: null }
      : splitDebitCredit(booking.valueInReferenceCurrency);

  return {
    id: booking.id,
    transactionId: booking.transactionId,
    bookingValue: toMoneyNumber(booking.value),
    date: formatUtcDateLabel(booking.date),
    account: booking.account,
    description: booking.description ?? "",
    unit: booking.unit,
    currency: booking.currency,
    cryptocurrency: booking.cryptocurrency,
    symbol: booking.symbol,
    tradeCurrency: booking.tradeCurrency,
    isOpeningBalancesTransaction: booking.isOpeningBalancesTransaction,
    debit,
    credit,
    referenceDebit: referenceValues.debit,
    referenceCredit: referenceValues.credit,
  };
}

function getSideReferenceTotal(
  bookings: TransactionsDerivedBooking[],
): Money | null {
  if (bookings.length === 0) {
    return toMoney(0);
  }

  if (bookings.some((booking) => booking.valueInReferenceCurrency == null)) {
    return null;
  }

  return moneyAbs(
    moneySum(bookings.map((booking) => booking.valueInReferenceCurrency ?? 0)),
  );
}

function getReferenceAmount(
  bookings: TransactionsDerivedBooking[],
): number | null {
  const debitTotal = getSideReferenceTotal(
    bookings.filter((booking) => toMoney(booking.value).comparedTo(0) > 0),
  );
  const creditTotal = getSideReferenceTotal(
    bookings.filter((booking) => toMoney(booking.value).comparedTo(0) < 0),
  );

  if (debitTotal == null || creditTotal == null) {
    return null;
  }

  return toMoneyNumber(
    toMoney(debitTotal).greaterThanOrEqualTo(creditTotal)
      ? debitTotal
      : creditTotal,
  );
}

function getSideOriginalTotal(bookings: TransactionsDerivedBooking[]): Money {
  return moneyAbs(moneySum(bookings.map((booking) => booking.value)));
}

function getOriginalAmountSummary(args: {
  bookings: TransactionsDerivedBooking[];
  referenceCurrency: string;
}): {
  originalAmount: number | null;
  originalAmountUnit: Unit | null;
  originalAmountCurrency: string | null;
  originalAmountCryptocurrency: string | null;
} {
  const unitKeyByBooking = args.bookings.map((booking) =>
    getNonReferenceUnitKey({
      booking,
      referenceCurrency: args.referenceCurrency,
    }),
  );
  const unitKeys = uniqueStrings(unitKeyByBooking);

  if (unitKeys.length !== 1) {
    return {
      originalAmount: null,
      originalAmountUnit: null,
      originalAmountCurrency: null,
      originalAmountCryptocurrency: null,
    };
  }

  const unitKey = unitKeys[0];
  const unitBookings = args.bookings.filter(
    (_booking, index) => unitKeyByBooking[index] === unitKey,
  );
  const firstUnitBooking = unitBookings[0];
  if (!firstUnitBooking) {
    throw new Error("Cannot derive an original amount without unit bookings.");
  }

  const debitTotal = getSideOriginalTotal(
    unitBookings.filter((booking) => toMoney(booking.value).comparedTo(0) > 0),
  );
  const creditTotal = getSideOriginalTotal(
    unitBookings.filter((booking) => toMoney(booking.value).comparedTo(0) < 0),
  );

  return {
    originalAmount: toMoneyNumber(
      toMoney(debitTotal).greaterThanOrEqualTo(creditTotal)
        ? debitTotal
        : creditTotal,
    ),
    originalAmountUnit: firstUnitBooking.unit,
    originalAmountCurrency: firstUnitBooking.currency,
    originalAmountCryptocurrency: firstUnitBooking.cryptocurrency,
  };
}

export function deriveTransactionsRows(args: {
  bookings: TransactionsDerivedBooking[];
  referenceCurrency: string;
}): {
  rows: TransactionsDerivedRow[];
} {
  const referenceCurrency = normalizeUnitCode(args.referenceCurrency);
  if (!referenceCurrency) {
    throw new Error("Reference currency is required.");
  }

  const bookingsByTransactionId = new Map<
    string,
    TransactionsDerivedBooking[]
  >();

  for (const booking of args.bookings) {
    const transactionBookings =
      bookingsByTransactionId.get(booking.transactionId) ?? [];
    transactionBookings.push(booking);
    bookingsByTransactionId.set(booking.transactionId, transactionBookings);
  }

  const rows = Array.from(bookingsByTransactionId.values()).map((bookings) => {
    const firstBooking = bookings[0];
    if (!firstBooking) {
      throw new Error("Cannot derive a transaction row without bookings.");
    }

    const earliestBookingDate = bookings.reduce(
      (earliestDate, booking) =>
        booking.date < earliestDate ? booking.date : earliestDate,
      firstBooking.date,
    );
    const originalAmountSummary = getOriginalAmountSummary({
      bookings,
      referenceCurrency,
    });

    return {
      id: firstBooking.transactionId,
      transactionId: firstBooking.transactionId,
      date: formatUtcDateLabel(earliestBookingDate),
      debitAccounts: uniqueById(
        bookings
          .filter((booking) => toMoney(booking.value).comparedTo(0) > 0)
          .map((booking) => booking.account),
      ),
      creditAccounts: uniqueById(
        bookings
          .filter((booking) => toMoney(booking.value).comparedTo(0) < 0)
          .map((booking) => booking.account),
      ),
      description: firstBooking.transactionDescription ?? "",
      unitIdentifiers: uniqueStrings(
        bookings.map((booking) =>
          getUnitIdentifier({ booking, referenceCurrency }),
        ),
      ),
      ...originalAmountSummary,
      referenceAmount: getReferenceAmount(bookings),
      isOpeningBalancesTransaction: bookings.some(
        (booking) => booking.isOpeningBalancesTransaction,
      ),
      bookings: bookings.map(toBookingRow),
      sortDate: earliestBookingDate,
      transactionCreatedAt: firstBooking.transactionCreatedAt,
    };
  });

  rows.sort((left, right) => {
    const dateComparison = right.sortDate.getTime() - left.sortDate.getTime();
    if (dateComparison !== 0) return dateComparison;

    const createdAtComparison =
      right.transactionCreatedAt.getTime() -
      left.transactionCreatedAt.getTime();
    if (createdAtComparison !== 0) return createdAtComparison;

    return left.transactionId.localeCompare(right.transactionId);
  });

  return {
    rows: rows.map(
      ({ sortDate: _sortDate, transactionCreatedAt: _createdAt, ...row }) =>
        row satisfies TransactionsDerivedRow,
    ),
  };
}

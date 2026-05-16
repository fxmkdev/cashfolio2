import { Unit } from "../.prisma-client/enums";
import { toMoney, toMoneyNumber } from "../shared/money";

export type TransactionsDerivedBooking = {
  id: string;
  date: Date;
  description: string | null;
  value: number;
  valueInReferenceCurrency: number | null;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  transactionId: string;
  transactionDescription: string | null;
  account: {
    id: string;
    name: string;
  };
  isOpeningBalancesTransaction: boolean;
};

export type TransactionsDerivedRow = {
  id: string;
  transactionId: string;
  bookingValue: number;
  date: string;
  account: {
    id: string;
    name: string;
  };
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

function formatUtcDateLabel(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  return `${day}.${month}.${year}`;
}

function splitDebitCredit(value: number): {
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

export function deriveTransactionsRows(args: {
  bookings: TransactionsDerivedBooking[];
}): {
  rows: TransactionsDerivedRow[];
} {
  return {
    rows: args.bookings.map((booking) => {
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
        description:
          booking.description || booking.transactionDescription || "",
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
      } satisfies TransactionsDerivedRow;
    }),
  };
}

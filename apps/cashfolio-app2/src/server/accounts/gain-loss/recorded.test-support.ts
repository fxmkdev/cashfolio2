import { toMoney } from "../../../shared/money";

export const book = {
  referenceCurrency: "CHF",
  startDate: new Date("2026-01-01Z"),
  periodCacheRevision: "revision",
};

export const portfolio = {
  id: "portfolio",
  name: "Portfolio",
  type: "BALANCE" as const,
  isActive: true,
  groupId: "group",
  unit: "CURRENCY" as const,
  currency: "CHF",
  cryptocurrency: null,
  symbol: null,
  tradeCurrency: null,
};
export function adjustment(
  id: string,
  date: string,
  amount: string,
  accountId = "portfolio",
  counterpartDate = date,
) {
  return {
    id,
    description: `Statement ${id}`,
    bookings: [
      {
        ...portfolio,
        id: `${id}:balance`,
        accountId,
        date: new Date(counterpartDate),
        value: amount,
        description: null,
        account: {
          type: "BALANCE",
          equityAccountSubtype: null,
          name: accountId,
        },
      },
      {
        ...portfolio,
        id: `${id}:equity`,
        accountId: "gain-loss",
        date: new Date(date),
        value: toMoney(amount).neg().toString(),
        description: `Adjustment ${id}`,
        account: {
          id: "gain-loss",
          type: "EQUITY",
          equityAccountSubtype: "GAIN_LOSS",
          name: "Gain/Loss",
          groupId: null,
        },
      },
    ],
  };
}

type Adjustment = ReturnType<typeof adjustment>;

export function selectCounterpartBookings(
  transactions: Adjustment[],
  transactionIds: string[],
) {
  return transactions
    .filter((tx) => transactionIds.includes(tx.id))
    .flatMap((tx) =>
      tx.bookings
        .filter((b) => b.account.type === "BALANCE")
        .map((b) => ({
          transactionId: tx.id,
          accountId: b.accountId,
          account: { name: b.account.name },
        })),
    );
}

export function selectEquityBookings(
  transactions: Adjustment[],
  currency: string,
  date: { gte: Date; lt: Date },
  counterpartAccountId?: string,
) {
  return transactions
    .filter(
      (tx) =>
        !counterpartAccountId ||
        tx.bookings.some((b) => b.accountId === counterpartAccountId),
    )
    .flatMap((tx) =>
      tx.bookings
        .filter(
          (b) =>
            b.account.type === "EQUITY" &&
            b.account.equityAccountSubtype === "GAIN_LOSS" &&
            b.date >= date.gte &&
            b.date < date.lt,
        )
        .map((b) => ({
          ...b,
          currency,
          transactionId: tx.id,
          transaction: { description: tx.description },
        })),
    );
}

export function selectLatestBooking(
  transactions: Adjustment[],
  endExclusive: Date,
) {
  const dates = transactions
    .flatMap((tx) => tx.bookings.map((booking) => booking.date))
    .filter((date) => date < endExclusive);
  return dates.length
    ? { date: new Date(Math.max(...dates.map((date) => date.getTime()))) }
    : null;
}

export function selectHoldingTransactions(
  transactions: Adjustment[],
  currency: string,
  date: { gte: Date; lt: Date },
) {
  return transactions
    .filter(
      (tx) =>
        tx.bookings.every((b) => b.date < date.lt) &&
        tx.bookings.some(
          (b) => b.account.type === "BALANCE" && b.date >= date.gte,
        ),
    )
    .map((tx) => ({
      ...tx,
      bookings: tx.bookings.map((b) => ({ ...b, currency })),
    }));
}

import { vi } from "vitest";
import { moneyMultiply, toMoney } from "../../../shared/money";
import type {
  HoldingRateConvertibleAccount,
  HoldingTransaction,
  HoldingTransactionBooking,
} from "../../holdings/types";
import { calculateAccountGainLoss } from "./calculation.server";

export const dates = {
  start: new Date("2026-01-01Z"),
  initial: new Date("2025-12-31Z"),
  end: new Date("2026-04-30Z"),
  exclusive: new Date("2026-05-01Z"),
};

export function account(
  id: string,
  unit: "SECURITY" | "CRYPTOCURRENCY" | "CURRENCY" = "SECURITY",
): HoldingRateConvertibleAccount {
  return {
    id,
    unit,
    currency: unit === "CURRENCY" ? "USD" : null,
    cryptocurrency: unit === "CRYPTOCURRENCY" ? "BTC" : null,
    symbol: unit === "SECURITY" ? "AAPL" : null,
    tradeCurrency: unit === "SECURITY" ? "CHF" : null,
  };
}

export function booking(
  id: string,
  holding: HoldingRateConvertibleAccount,
  date: string,
  value: number,
  type: "BALANCE" = "BALANCE",
): HoldingTransactionBooking {
  return {
    ...holding,
    id,
    accountId: holding.id,
    date: new Date(date),
    value: toMoney(value),
    accountType: type,
    equityAccountSubtype: null,
    transactionId: `tx:${id}`,
    transactionDescription: id,
  };
}

export function trade(
  id: string,
  holding: HoldingRateConvertibleAccount,
  date: string,
  quantity: number,
  amount: number,
): HoldingTransaction {
  return {
    bookings: [
      booking(id, holding, date, quantity),
      booking(
        `cash:${id}`,
        { ...account("cash", "CURRENCY"), currency: "CHF" },
        date,
        -amount,
      ),
    ],
  };
}

export function calculate(
  args: {
    accounts?: HoldingRateConvertibleAccount[];
    transactions?: HoldingTransaction[];
    opening?: number;
    closingRate?: number | null;
    initialRate?: number | null;
    missingBooking?: string;
    detailAccountId?: string;
    unavailableHoldings?: string[];
  } = {},
) {
  const accounts = args.accounts ?? [account("a")];
  return calculateAccountGainLoss({
    holdingAccounts: accounts,
    initialBalanceByAccountId: new Map([
      [accounts[0]!.id, toMoney(args.opening ?? 0)],
    ]),
    transactions: args.transactions ?? [],
    periodStart: dates.start,
    periodEnd: dates.end,
    periodEndExclusive: dates.exclusive,
    initialRateDate: dates.initial,
    detailAccountId: args.detailAccountId,
    unavailableHoldings: args.unavailableHoldings,
    resolveRate: vi.fn(async ({ date }) => {
      const rate =
        date.getTime() === dates.initial.getTime()
          ? args.initialRate === undefined
            ? 100
            : args.initialRate
          : args.closingRate === undefined
            ? 160
            : args.closingRate;
      return rate == null ? null : toMoney(rate);
    }),
    convertBookingToReference: async (item) =>
      item.id === args.missingBooking
        ? null
        : moneyMultiply(item.value, item.currency === "CHF" ? 1 : 100),
  });
}

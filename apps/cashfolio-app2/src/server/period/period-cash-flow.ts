import { toMoney, type Money, moneyAdd } from "../../shared/money";
import { AccountType, Unit } from "../../.prisma-client/enums";

import type { BreakdownHierarchyAccumulatorItem } from "./period-helpers";

export type PeriodCashFlowBooking = {
  value: Money;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  date: Date;
  account: {
    id: string;
    name: string;
    groupId: string | null;
    type: AccountType;
    isCashAccount: boolean;
  };
};

export type PeriodCashFlowTransaction = {
  id: string;
  bookings: PeriodCashFlowBooking[];
};

type ConvertBookingToReference = (booking: {
  value: Money;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  date: Date;
}) => Promise<Money | null>;

function isPureCashTransfer(transaction: PeriodCashFlowTransaction): boolean {
  return (
    transaction.bookings.length > 1 &&
    transaction.bookings.every(
      (booking) =>
        booking.account.type !== AccountType.EQUITY &&
        booking.account.isCashAccount,
    )
  );
}

function isWithinPeriod(args: {
  date: Date;
  periodStart?: Date;
  periodEndExclusive?: Date;
}): boolean {
  if (args.periodStart && args.date < args.periodStart) {
    return false;
  }
  if (args.periodEndExclusive && args.date >= args.periodEndExclusive) {
    return false;
  }
  return true;
}

export async function computePeriodCashFlow(args: {
  transactions: PeriodCashFlowTransaction[];
  convertBookingToReference: ConvertBookingToReference;
  periodStart?: Date;
  periodEndExclusive?: Date;
}): Promise<{
  cashFlow: Money;
  skippedCount: number;
  cashFlowAmountByAccountId: Map<string, BreakdownHierarchyAccumulatorItem>;
}> {
  let cashFlow: Money = toMoney(0);
  let skippedCount = 0;
  const cashFlowAmountByAccountId = new Map<
    string,
    BreakdownHierarchyAccumulatorItem
  >();

  for (const transaction of args.transactions) {
    if (isPureCashTransfer(transaction)) {
      continue;
    }

    const cashBookings = transaction.bookings.filter(
      (booking) =>
        booking.account.type === AccountType.ASSET &&
        booking.account.isCashAccount &&
        isWithinPeriod({
          date: booking.date,
          periodStart: args.periodStart,
          periodEndExclusive: args.periodEndExclusive,
        }),
    );
    const convertedValues = await Promise.all(
      cashBookings.map((booking) =>
        args.convertBookingToReference({
          value: booking.value,
          unit: booking.unit,
          currency: booking.currency,
          cryptocurrency: booking.cryptocurrency,
          symbol: booking.symbol,
          tradeCurrency: booking.tradeCurrency,
          date: booking.date,
        }),
      ),
    );

    for (const [index, convertedValue] of convertedValues.entries()) {
      if (convertedValue == null) {
        skippedCount += 1;
        continue;
      }
      cashFlow = moneyAdd(cashFlow, convertedValue);
      const booking = cashBookings[index];
      if (!booking) {
        continue;
      }

      const existing = cashFlowAmountByAccountId.get(booking.account.id);
      cashFlowAmountByAccountId.set(booking.account.id, {
        accountId: booking.account.id,
        accountName: booking.account.name,
        groupId: booking.account.groupId,
        amount: moneyAdd(existing?.amount ?? toMoney(0), convertedValue),
      });
    }
  }

  return { cashFlow, skippedCount, cashFlowAmountByAccountId };
}

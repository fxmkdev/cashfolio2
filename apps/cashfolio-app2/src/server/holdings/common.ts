import { AccountType, EquityAccountSubtype } from "../../.prisma-client/enums";
import {
  moneyAbs,
  moneyDivide,
  moneySum,
  toMoney,
  type Money,
} from "../../shared/money";
import { QUANTITY_EPSILON } from "./quantity-policy";

import type { HoldingTransactionBooking } from "./types";

export function isExplicitGainLossBooking(
  booking: HoldingTransactionBooking,
): boolean {
  return (
    booking.accountType === AccountType.EQUITY &&
    booking.equityAccountSubtype === EquityAccountSubtype.GAIN_LOSS
  );
}

export function isWithinPeriod(args: {
  date: Date;
  periodStart: Date;
  periodEndExclusive: Date;
}): boolean {
  return args.date >= args.periodStart && args.date < args.periodEndExclusive;
}

export function toLotAcquisitionSortKey(args: {
  date: Date;
  bookingId: string;
  portion?: "transfer-fallback" | "execution";
}): string {
  return `${args.date.toISOString()}::${args.bookingId}${args.portion ? `::${args.portion === "transfer-fallback" ? "0" : "1"}` : ""}`;
}

export function buildResidualAllocationWeights(args: {
  holdingBookings: HoldingTransactionBooking[];
  holdingMarketValueByBookingId: Map<string, Money>;
}): Money[] {
  const valueWeights = args.holdingBookings.map((booking) =>
    moneyAbs(args.holdingMarketValueByBookingId.get(booking.id) ?? toMoney(0)),
  );
  const totalValueWeight = moneySum(valueWeights);

  if (toMoney(totalValueWeight).comparedTo(QUANTITY_EPSILON) > 0) {
    return valueWeights.map((weight) => moneyDivide(weight, totalValueWeight));
  }

  const quantityWeights = args.holdingBookings.map((booking) =>
    moneyAbs(booking.value),
  );
  const totalQuantityWeight = moneySum(quantityWeights);

  if (toMoney(totalQuantityWeight).comparedTo(QUANTITY_EPSILON) > 0) {
    return quantityWeights.map((weight) =>
      moneyDivide(weight, totalQuantityWeight),
    );
  }

  return args.holdingBookings.map(() =>
    moneyDivide(1, args.holdingBookings.length),
  );
}

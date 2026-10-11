import {
  toMoney,
  type Money,
  MoneyDecimal,
  moneyAdd,
  moneySubtract,
  moneyMultiply,
  moneyDivide,
  moneyAbs,
  moneySum,
} from "../../shared/money";
import { AccountType, EquityAccountSubtype } from "../../.prisma-client/enums";

import type {
  HoldingExecutionLotMatch,
  HoldingLot,
  HoldingTransactionBooking,
} from "./period-overview-holdings-types";

export const QUANTITY_EPSILON = 1e-9;

export function isExplicitGainLossBooking(
  booking: HoldingTransactionBooking,
): boolean {
  return (
    booking.accountType === AccountType.EQUITY &&
    booking.equityAccountSubtype === EquityAccountSubtype.GAIN_LOSS
  );
}

export function isNearZero(value: Money): boolean {
  return !moneyAbs(value).gt(QUANTITY_EPSILON);
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
}): string {
  return `${args.date.toISOString()}::${args.bookingId}`;
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

export function applyExecutionToLots(args: {
  lots: HoldingLot[];
  quantity: Money;
  executionUnitPriceInReference: Money;
  acquisitionSortKey: string;
  onLotMatched?: (match: HoldingExecutionLotMatch) => void;
}): Money {
  let realizedGainLoss: Money = toMoney(0);
  let remainingQuantity = args.quantity;

  while (
    !isNearZero(remainingQuantity) &&
    args.lots.length > 0 &&
    toMoney(remainingQuantity).comparedTo(0) !==
      toMoney(args.lots[0]!.quantity).comparedTo(0)
  ) {
    const lot = args.lots[0]!;
    const lotAcquisitionSortKey = lot.acquisitionSortKey;
    const lotUnitCostInReference = lot.unitCostInReference;
    const closeQuantity = MoneyDecimal.min(
      moneyAbs(remainingQuantity),
      moneyAbs(lot.quantity),
    );
    let lotRealizedGainLossDelta: Money = toMoney(0);

    if (
      toMoney(lot.quantity).comparedTo(0) > 0 &&
      toMoney(remainingQuantity).comparedTo(0) < 0
    ) {
      lotRealizedGainLossDelta = moneyMultiply(
        closeQuantity,
        moneySubtract(
          args.executionUnitPriceInReference,
          lotUnitCostInReference,
        ),
      );
    } else if (
      toMoney(lot.quantity).comparedTo(0) < 0 &&
      toMoney(remainingQuantity).comparedTo(0) > 0
    ) {
      lotRealizedGainLossDelta = moneyMultiply(
        closeQuantity,
        moneySubtract(
          lotUnitCostInReference,
          args.executionUnitPriceInReference,
        ),
      );
    }
    realizedGainLoss = moneyAdd(realizedGainLoss, lotRealizedGainLossDelta);
    args.onLotMatched?.({
      acquisitionSortKey: lotAcquisitionSortKey,
      matchedQuantity: closeQuantity,
      lotUnitCostInReference,
      executionUnitPriceInReference: args.executionUnitPriceInReference,
      realizedGainLossDelta: lotRealizedGainLossDelta,
      runningEventRealizedGainLoss: realizedGainLoss,
    });

    lot.quantity = moneySubtract(
      lot.quantity,
      moneyMultiply(toMoney(lot.quantity).comparedTo(0), closeQuantity),
    );
    remainingQuantity = moneySubtract(
      remainingQuantity,
      moneyMultiply(toMoney(remainingQuantity).comparedTo(0), closeQuantity),
    );

    if (isNearZero(lot.quantity)) {
      args.lots.shift();
    }
  }

  if (!isNearZero(remainingQuantity)) {
    args.lots.push({
      quantity: remainingQuantity,
      unitCostInReference: args.executionUnitPriceInReference,
      acquisitionSortKey: args.acquisitionSortKey,
    });
  }

  return realizedGainLoss;
}

import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
import type {
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

export function isNearZero(value: number): boolean {
  return Math.abs(value) <= QUANTITY_EPSILON;
}

export function isWithinPeriod(args: {
  date: Date;
  periodStart: Date;
  periodEndExclusive: Date;
}): boolean {
  return args.date >= args.periodStart && args.date < args.periodEndExclusive;
}

export function buildResidualAllocationWeights(args: {
  holdingBookings: HoldingTransactionBooking[];
  holdingMarketValueByBookingId: Map<string, number>;
}): number[] {
  const valueWeights = args.holdingBookings.map((booking) =>
    Math.abs(args.holdingMarketValueByBookingId.get(booking.id) ?? 0),
  );
  const totalValueWeight = valueWeights.reduce(
    (sum, weight) => sum + weight,
    0,
  );

  if (totalValueWeight > QUANTITY_EPSILON) {
    return valueWeights.map((weight) => weight / totalValueWeight);
  }

  const quantityWeights = args.holdingBookings.map((booking) =>
    Math.abs(booking.value),
  );
  const totalQuantityWeight = quantityWeights.reduce(
    (sum, weight) => sum + weight,
    0,
  );

  if (totalQuantityWeight > QUANTITY_EPSILON) {
    return quantityWeights.map((weight) => weight / totalQuantityWeight);
  }

  return args.holdingBookings.map(() => 1 / args.holdingBookings.length);
}

export function applyExecutionToLots(args: {
  lots: HoldingLot[];
  quantity: number;
  executionUnitPriceInReference: number;
  acquisitionSortKey: string;
}): number {
  let realizedGainLoss = 0;
  let remainingQuantity = args.quantity;

  while (
    !isNearZero(remainingQuantity) &&
    args.lots.length > 0 &&
    Math.sign(remainingQuantity) !== Math.sign(args.lots[0]!.quantity)
  ) {
    const lot = args.lots[0]!;
    const closeQuantity = Math.min(
      Math.abs(remainingQuantity),
      Math.abs(lot.quantity),
    );

    if (lot.quantity > 0 && remainingQuantity < 0) {
      realizedGainLoss +=
        closeQuantity *
        (args.executionUnitPriceInReference - lot.unitCostInReference);
    } else if (lot.quantity < 0 && remainingQuantity > 0) {
      realizedGainLoss +=
        closeQuantity *
        (lot.unitCostInReference - args.executionUnitPriceInReference);
    }

    lot.quantity -= Math.sign(lot.quantity) * closeQuantity;
    remainingQuantity -= Math.sign(remainingQuantity) * closeQuantity;

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

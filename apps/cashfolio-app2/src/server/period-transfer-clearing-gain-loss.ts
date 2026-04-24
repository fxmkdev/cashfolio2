import { Unit } from "../.prisma-client/enums";
import {
  applyExecutionToLots,
  isNearZero,
  QUANTITY_EPSILON,
} from "./period-overview-holdings-common";
import {
  toTransferClearingLotSortKey,
  type TransferClearingBooking,
  type TransferClearingUnitBucket,
} from "./period-transfer-clearing-types";

export async function computeTransferClearingGainLossSplit(args: {
  unitBuckets: TransferClearingUnitBucket[];
  periodStart: Date;
  periodEndExclusive: Date;
  initialRateDate: Date;
  periodEnd: Date;
  resolveRate: (input: {
    unit: Unit;
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
    date: Date;
  }) => Promise<number | null>;
  convertBookingToReference: (
    booking: TransferClearingBooking,
  ) => Promise<number | null>;
}) {
  let realizedGainLoss = 0;
  let unrealizedGainLoss = 0;
  let convertedCount = 0;
  let skippedCount = 0;

  for (const unitBucket of args.unitBuckets) {
    if (!unitBucket.isNonReferenceUnit) {
      continue;
    }

    const lots: Array<{
      quantity: number;
      unitCostInReference: number;
      acquisitionSortKey: string;
    }> = [];

    const openingPostedBalance = unitBucket.bookings
      .filter((booking) => booking.date < args.periodStart)
      .reduce((sum, booking) => sum + booking.value, 0);
    const openingBalance = -openingPostedBalance;

    if (!isNearZero(openingBalance)) {
      const initialRate = await args.resolveRate({
        unit: unitBucket.unit,
        currency: unitBucket.currency,
        cryptocurrency: unitBucket.cryptocurrency,
        symbol: unitBucket.symbol,
        tradeCurrency: unitBucket.tradeCurrency,
        date: args.initialRateDate,
      });
      if (initialRate == null) {
        skippedCount += 1;
        continue;
      }

      lots.push({
        quantity: openingBalance,
        unitCostInReference: initialRate,
        acquisitionSortKey: toTransferClearingLotSortKey({
          date: args.initialRateDate,
          bookingId: `opening:${unitBucket.unitKey}`,
        }),
      });
    }

    const inPeriodBookings = unitBucket.bookings
      .filter(
        (booking) =>
          booking.date >= args.periodStart &&
          booking.date < args.periodEndExclusive,
      )
      .sort((left, right) => {
        const dateDiff = left.date.getTime() - right.date.getTime();
        if (dateDiff !== 0) {
          return dateDiff;
        }
        return left.id.localeCompare(right.id, "en");
      });

    const convertibleInPeriodBookings = inPeriodBookings.filter(
      (booking) => !isNearZero(booking.value),
    );
    const convertedValues = await Promise.all(
      convertibleInPeriodBookings.map((booking) =>
        args.convertBookingToReference(booking),
      ),
    );

    for (
      let bookingIndex = 0;
      bookingIndex < convertibleInPeriodBookings.length;
      bookingIndex += 1
    ) {
      const booking = convertibleInPeriodBookings[bookingIndex]!;
      const convertedValue = convertedValues[bookingIndex];
      if (convertedValue == null) {
        skippedCount += 1;
        continue;
      }

      const clearingQuantity = -booking.value;
      const clearingReferenceAmount = -convertedValue;
      const executionUnitPriceInReference =
        clearingReferenceAmount / clearingQuantity;
      if (!Number.isFinite(executionUnitPriceInReference)) {
        skippedCount += 1;
        continue;
      }
      convertedCount += 1;

      realizedGainLoss += applyExecutionToLots({
        lots,
        quantity: clearingQuantity,
        executionUnitPriceInReference,
        acquisitionSortKey: toTransferClearingLotSortKey({
          date: booking.date,
          bookingId: booking.id,
        }),
      });
    }

    const openQuantity = lots.reduce(
      (sum, lot) => sum + Math.abs(lot.quantity),
      0,
    );
    if (openQuantity <= QUANTITY_EPSILON) {
      continue;
    }

    const periodEndRate = await args.resolveRate({
      unit: unitBucket.unit,
      currency: unitBucket.currency,
      cryptocurrency: unitBucket.cryptocurrency,
      symbol: unitBucket.symbol,
      tradeCurrency: unitBucket.tradeCurrency,
      date: args.periodEnd,
    });
    if (periodEndRate == null) {
      skippedCount += 1;
      continue;
    }

    unrealizedGainLoss += lots.reduce(
      (sum, lot) =>
        sum + lot.quantity * (periodEndRate - lot.unitCostInReference),
      0,
    );
  }

  return {
    realizedGainLoss,
    unrealizedGainLoss,
    convertedCount,
    skippedCount,
  };
}

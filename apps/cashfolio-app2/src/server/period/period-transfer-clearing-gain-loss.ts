import { Unit } from "../../.prisma-client/enums";
import {
  moneyAbs,
  moneyAdd,
  moneyDivide,
  moneyMultiply,
  moneySubtract,
  moneySum,
  toMoneyNumber,
} from "../../shared/money";
import type { HoldingGainLossSkippedReason } from "./period-overview-holdings";
import type { HoldingExecutionLotMatch } from "./period-overview-holdings-types";
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

type TransferClearingGainLossSkippedReason = HoldingGainLossSkippedReason;

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
  onUnitGainLoss?: (gainLossByUnit: {
    unitKey: TransferClearingUnitBucket["unitKey"];
    unitLabel: TransferClearingUnitBucket["unitLabel"];
    unit: TransferClearingUnitBucket["unit"];
    currency: TransferClearingUnitBucket["currency"];
    cryptocurrency: TransferClearingUnitBucket["cryptocurrency"];
    symbol: TransferClearingUnitBucket["symbol"];
    tradeCurrency: TransferClearingUnitBucket["tradeCurrency"];
    realizedGainLoss: number;
    unrealizedGainLoss: number;
  }) => void;
  onUnitExecutionEvent?: (event: {
    unitKey: TransferClearingUnitBucket["unitKey"];
    bookingId: string;
    bookingDescription?: string | null;
    transactionDescription?: string | null;
    transactionId: string | null;
    date: Date;
    quantity: number;
    pricingSource: "directConversion";
    marketReferenceAmount: number;
    residualAllocationAmount: number;
    effectiveReferenceAmount: number;
    executionUnitPriceInReference: number;
    realizedGainLossDelta: number;
    runningRealizedGainLoss: number;
    lotMatches: HoldingExecutionLotMatch[];
  }) => void;
  onUnitOpenLotValuation?: (lot: {
    unitKey: TransferClearingUnitBucket["unitKey"];
    acquisitionSortKey: string;
    quantity: number;
    unitCostInReference: number;
    periodEndRate: number;
    unrealizedGainLoss: number;
  }) => void;
  onSkippedItem?: (item: {
    unitKey: TransferClearingUnitBucket["unitKey"];
    bookingId?: string;
    bookingDescription?: string | null;
    transactionDescription?: string | null;
    transactionId?: string | null;
    reason: TransferClearingGainLossSkippedReason;
    date: Date;
  }) => void;
}) {
  let realizedGainLoss = 0;
  let unrealizedGainLoss = 0;
  let convertedCount = 0;
  let skippedCount = 0;

  for (const unitBucket of args.unitBuckets) {
    if (!unitBucket.isNonReferenceUnit) {
      continue;
    }
    let unitRealizedGainLoss = 0;
    let unitUnrealizedGainLoss = 0;

    const lots: Array<{
      quantity: number;
      unitCostInReference: number;
      acquisitionSortKey: string;
    }> = [];

    const openingPostedBalance = unitBucket.bookings
      .filter((booking) => booking.date < args.periodStart)
      .map((booking) => booking.value);
    const openingBalance = toMoneyNumber(
      moneySubtract(0, moneySum(openingPostedBalance)),
    );

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
        args.onSkippedItem?.({
          unitKey: unitBucket.unitKey,
          reason: "missingInitialRate",
          date: args.initialRateDate,
        });
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
        args.onSkippedItem?.({
          unitKey: unitBucket.unitKey,
          bookingId: booking.id,
          bookingDescription: booking.description,
          transactionDescription: booking.transactionDescription,
          transactionId: booking.transactionId ?? null,
          reason: "missingConversion",
          date: booking.date,
        });
        continue;
      }

      const clearingQuantity = -booking.value;
      const clearingReferenceAmount = -convertedValue;
      const executionUnitPriceInReference = toMoneyNumber(
        moneyDivide(clearingReferenceAmount, clearingQuantity),
      );
      if (!Number.isFinite(executionUnitPriceInReference)) {
        skippedCount += 1;
        args.onSkippedItem?.({
          unitKey: unitBucket.unitKey,
          bookingId: booking.id,
          bookingDescription: booking.description,
          transactionDescription: booking.transactionDescription,
          transactionId: booking.transactionId ?? null,
          reason: "invalidExecutionPrice",
          date: booking.date,
        });
        continue;
      }
      convertedCount += 1;

      let lotMatches: HoldingExecutionLotMatch[] | undefined;
      const bookingRealizedGainLoss = applyExecutionToLots({
        lots,
        quantity: clearingQuantity,
        executionUnitPriceInReference,
        acquisitionSortKey: toTransferClearingLotSortKey({
          date: booking.date,
          bookingId: booking.id,
        }),
        ...(args.onUnitExecutionEvent
          ? {
              onLotMatched: (lotMatch: HoldingExecutionLotMatch) => {
                if (!lotMatches) {
                  lotMatches = [];
                }
                lotMatches.push(lotMatch);
              },
            }
          : {}),
      });
      realizedGainLoss = toMoneyNumber(
        moneyAdd(realizedGainLoss, bookingRealizedGainLoss),
      );
      unitRealizedGainLoss = toMoneyNumber(
        moneyAdd(unitRealizedGainLoss, bookingRealizedGainLoss),
      );
      args.onUnitExecutionEvent?.({
        unitKey: unitBucket.unitKey,
        bookingId: booking.id,
        bookingDescription: booking.description,
        transactionDescription: booking.transactionDescription,
        transactionId: booking.transactionId ?? null,
        date: booking.date,
        quantity: clearingQuantity,
        pricingSource: "directConversion",
        marketReferenceAmount: clearingReferenceAmount,
        residualAllocationAmount: 0,
        effectiveReferenceAmount: clearingReferenceAmount,
        executionUnitPriceInReference,
        realizedGainLossDelta: bookingRealizedGainLoss,
        runningRealizedGainLoss: unitRealizedGainLoss,
        lotMatches: lotMatches ?? [],
      });
    }

    const openQuantity = lots.reduce(
      (sum, lot) => toMoneyNumber(moneyAdd(sum, moneyAbs(lot.quantity))),
      0,
    );
    if (openQuantity > QUANTITY_EPSILON) {
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
        args.onSkippedItem?.({
          unitKey: unitBucket.unitKey,
          reason: "missingPeriodEndRate",
          date: args.periodEnd,
        });
      } else {
        let unitUnrealized = 0;
        for (const lot of lots) {
          const lotUnrealizedGainLoss = toMoneyNumber(
            moneyMultiply(
              lot.quantity,
              moneySubtract(periodEndRate, lot.unitCostInReference),
            ),
          );
          unitUnrealized = toMoneyNumber(
            moneyAdd(unitUnrealized, lotUnrealizedGainLoss),
          );
          args.onUnitOpenLotValuation?.({
            unitKey: unitBucket.unitKey,
            acquisitionSortKey: lot.acquisitionSortKey,
            quantity: lot.quantity,
            unitCostInReference: lot.unitCostInReference,
            periodEndRate,
            unrealizedGainLoss: lotUnrealizedGainLoss,
          });
        }
        unrealizedGainLoss = toMoneyNumber(
          moneyAdd(unrealizedGainLoss, unitUnrealized),
        );
        unitUnrealizedGainLoss = toMoneyNumber(
          moneyAdd(unitUnrealizedGainLoss, unitUnrealized),
        );
      }
    }

    if (
      args.onUnitGainLoss &&
      (!isNearZero(unitRealizedGainLoss) || !isNearZero(unitUnrealizedGainLoss))
    ) {
      args.onUnitGainLoss({
        unitKey: unitBucket.unitKey,
        unitLabel: unitBucket.unitLabel,
        unit: unitBucket.unit,
        currency: unitBucket.currency,
        cryptocurrency: unitBucket.cryptocurrency,
        symbol: unitBucket.symbol,
        tradeCurrency: unitBucket.tradeCurrency,
        realizedGainLoss: unitRealizedGainLoss,
        unrealizedGainLoss: unitUnrealizedGainLoss,
      });
    }
  }

  return {
    realizedGainLoss,
    unrealizedGainLoss,
    convertedCount,
    skippedCount,
  };
}

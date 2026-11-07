import {
  moneyAdd,
  moneyDivide,
  moneyIsFinite,
  moneySubtract,
  moneySum,
  toMoney,
  type Money,
} from "../../../shared/money";
import type {
  TransferClearingGainLossArgs,
  TransferClearingTotals,
  TransferClearingUnitState,
} from "./period-transfer-clearing-gain-loss-types";
import { valueTransferClearingUnit } from "./period-transfer-clearing-valuation";

import { applyExecutionToLots } from "../../holdings/lots";
import { isNearZero } from "../../holdings/quantity-policy";
import type { HoldingExecutionLotMatch } from "../../holdings/types";
import {
  toTransferClearingLotSortKey,
  type TransferClearingBooking,
  type TransferClearingUnitBucket,
} from "./period-transfer-clearing-types";

export async function computeTransferClearingGainLossSplit(
  args: TransferClearingGainLossArgs,
) {
  const totals: TransferClearingTotals = {
    realizedGainLoss: toMoney(0),
    unrealizedGainLoss: toMoney(0),
    convertedCount: 0,
    skippedCount: 0,
  };
  for (const unitBucket of args.unitBuckets) {
    if (!unitBucket.isNonReferenceUnit) continue;
    const lots = await initializeTransferClearingLots(args, unitBucket, totals);
    if (!lots) continue;
    const unitState: TransferClearingUnitState = {
      lots,
      realizedGainLoss: toMoney(0),
      unrealizedGainLoss: toMoney(0),
    };
    const { convertibleInPeriodBookings, convertedValues } =
      await convertTransferClearingBookings(args, unitBucket);
    for (
      let bookingIndex = 0;
      bookingIndex < convertibleInPeriodBookings.length;
      bookingIndex += 1
    ) {
      applyTransferClearingExecution(
        args,
        unitBucket,
        unitState,
        totals,
        convertibleInPeriodBookings[bookingIndex]!,
        convertedValues[bookingIndex],
      );
    }
    await valueTransferClearingUnit(args, unitBucket, unitState, totals);
    emitTransferClearingUnitGainLoss(args, unitBucket, unitState);
  }
  return totals;
}

async function initializeTransferClearingLots(
  args: TransferClearingGainLossArgs,
  unitBucket: TransferClearingUnitBucket,
  totals: TransferClearingTotals,
) {
  const lots: Array<{
    quantity: Money;
    unitCostInReference: Money;
    acquisitionSortKey: string;
  }> = [];

  const openingPostedBalance = unitBucket.bookings
    .filter((booking) => booking.date < args.periodStart)
    .map((booking) => booking.value);
  const openingBalance = moneySubtract(0, moneySum(openingPostedBalance));

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
      totals.skippedCount += 1;
      args.onSkippedItem?.({
        unitKey: unitBucket.unitKey,
        reason: "missingInitialRate",
        date: args.initialRateDate,
      });
      return null;
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

  return lots;
}

async function convertTransferClearingBookings(
  args: TransferClearingGainLossArgs,
  unitBucket: TransferClearingUnitBucket,
) {
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

  return { convertibleInPeriodBookings, convertedValues };
}

function applyTransferClearingExecution(
  args: TransferClearingGainLossArgs,
  unitBucket: TransferClearingUnitBucket,
  unitState: TransferClearingUnitState,
  totals: TransferClearingTotals,
  booking: TransferClearingBooking,
  convertedValue: Money | null,
) {
  const { lots } = unitState;
  const price = priceTransferClearingExecution(
    args,
    unitBucket,
    totals,
    booking,
    convertedValue,
  );
  if (!price) return;
  const {
    clearingQuantity,
    clearingReferenceAmount,
    executionUnitPriceInReference,
  } = price;
  totals.convertedCount += 1;

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
  totals.realizedGainLoss = moneyAdd(
    totals.realizedGainLoss,
    bookingRealizedGainLoss,
  );
  unitState.realizedGainLoss = moneyAdd(
    unitState.realizedGainLoss,
    bookingRealizedGainLoss,
  );
  emitTransferClearingExecution(
    args,
    unitBucket,
    booking,
    unitState.realizedGainLoss,
    {
      clearingQuantity,
      clearingReferenceAmount,
      executionUnitPriceInReference,
      bookingRealizedGainLoss,
      lotMatches,
    },
  );
}

type TransferClearingExecution = {
  clearingQuantity: Money;
  clearingReferenceAmount: Money;
  executionUnitPriceInReference: Money;
  bookingRealizedGainLoss: Money;
  lotMatches: HoldingExecutionLotMatch[] | undefined;
};

function emitTransferClearingExecution(
  args: TransferClearingGainLossArgs,
  unitBucket: TransferClearingUnitBucket,
  booking: TransferClearingBooking,
  unitRealizedGainLoss: Money,
  execution: TransferClearingExecution,
) {
  const {
    clearingQuantity,
    clearingReferenceAmount,
    executionUnitPriceInReference,
    bookingRealizedGainLoss,
    lotMatches,
  } = execution;
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
    residualAllocationAmount: toMoney(0),
    effectiveReferenceAmount: clearingReferenceAmount,
    executionUnitPriceInReference,
    realizedGainLossDelta: bookingRealizedGainLoss,
    runningRealizedGainLoss: unitRealizedGainLoss,
    lotMatches: lotMatches ?? [],
  });
}

function emitTransferClearingUnitGainLoss(
  args: TransferClearingGainLossArgs,
  unitBucket: TransferClearingUnitBucket,
  unitState: TransferClearingUnitState,
) {
  if (
    args.onUnitGainLoss &&
    (!isNearZero(unitState.realizedGainLoss) ||
      !isNearZero(unitState.unrealizedGainLoss))
  ) {
    args.onUnitGainLoss({
      unitKey: unitBucket.unitKey,
      unitLabel: unitBucket.unitLabel,
      unit: unitBucket.unit,
      currency: unitBucket.currency,
      cryptocurrency: unitBucket.cryptocurrency,
      symbol: unitBucket.symbol,
      tradeCurrency: unitBucket.tradeCurrency,
      realizedGainLoss: unitState.realizedGainLoss,
      unrealizedGainLoss: unitState.unrealizedGainLoss,
    });
  }
}

function priceTransferClearingExecution(
  args: TransferClearingGainLossArgs,
  unitBucket: TransferClearingUnitBucket,
  totals: TransferClearingTotals,
  booking: TransferClearingBooking,
  convertedValue: Money | null,
) {
  if (convertedValue == null) {
    totals.skippedCount += 1;
    args.onSkippedItem?.({
      unitKey: unitBucket.unitKey,
      bookingId: booking.id,
      bookingDescription: booking.description,
      transactionDescription: booking.transactionDescription,
      transactionId: booking.transactionId ?? null,
      reason: "missingConversion",
      date: booking.date,
    });
    return null;
  }

  const clearingQuantity = toMoney(booking.value).neg();
  const clearingReferenceAmount = toMoney(convertedValue).neg();
  const executionUnitPriceInReference = toMoney(
    moneyDivide(clearingReferenceAmount, clearingQuantity),
  );
  if (!moneyIsFinite(executionUnitPriceInReference)) {
    totals.skippedCount += 1;
    args.onSkippedItem?.({
      unitKey: unitBucket.unitKey,
      bookingId: booking.id,
      bookingDescription: booking.description,
      transactionDescription: booking.transactionDescription,
      transactionId: booking.transactionId ?? null,
      reason: "invalidExecutionPrice",
      date: booking.date,
    });
    return null;
  }
  return {
    clearingQuantity,
    clearingReferenceAmount,
    executionUnitPriceInReference,
  };
}

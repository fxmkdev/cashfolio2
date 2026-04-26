import {
  isNearZero,
  toLotAcquisitionSortKey,
  QUANTITY_EPSILON,
} from "./period-overview-holdings-common";
import type {
  HoldingBookingConverter,
  HoldingGainLossWorkingState,
  HoldingLot,
  HoldingTransactionBooking,
} from "./period-overview-holdings-types";

function insertLotByAcquisitionOrder(args: {
  lots: HoldingLot[];
  lot: HoldingLot;
}) {
  const insertIndex = args.lots.findIndex(
    (existingLot) =>
      existingLot.acquisitionSortKey > args.lot.acquisitionSortKey,
  );

  if (insertIndex === -1) {
    args.lots.push(args.lot);
    return;
  }

  args.lots.splice(insertIndex, 0, args.lot);
}

function applyNonRealizingExecutionToLots(args: {
  lots: HoldingLot[];
  quantity: number;
  unitCostInReference: number;
  acquisitionSortKey: string;
}) {
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
    lot.quantity -= Math.sign(lot.quantity) * closeQuantity;
    remainingQuantity -= Math.sign(remainingQuantity) * closeQuantity;

    if (isNearZero(lot.quantity)) {
      args.lots.shift();
    }
  }

  if (isNearZero(remainingQuantity)) {
    return;
  }

  insertLotByAcquisitionOrder({
    lots: args.lots,
    lot: {
      quantity: remainingQuantity,
      unitCostInReference: args.unitCostInReference,
      acquisitionSortKey: args.acquisitionSortKey,
    },
  });
}

function isMixedPeriodSameUnitHoldingTransfer(args: {
  allNonExplicitAreHolding: boolean;
  allNonExplicitInPeriod: boolean;
  nonExplicitUnitIdentifiers: Set<string | null>;
}): boolean {
  return (
    args.allNonExplicitAreHolding &&
    !args.allNonExplicitInPeriod &&
    args.nonExplicitUnitIdentifiers.size === 1 &&
    !args.nonExplicitUnitIdentifiers.has(null)
  );
}

function toSortedBookings(
  bookings: HoldingTransactionBooking[],
): HoldingTransactionBooking[] {
  return [...bookings].sort((left, right) => {
    const dateDiff = left.date.getTime() - right.date.getTime();
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return left.id.localeCompare(right.id, "en");
  });
}

export async function applyMixedPeriodSameUnitHoldingTransfer(args: {
  state: HoldingGainLossWorkingState;
  inPeriodHoldingBookings: HoldingTransactionBooking[];
  allNonExplicitAreHolding: boolean;
  allNonExplicitInPeriod: boolean;
  nonExplicitUnitIdentifiers: Set<string | null>;
  convertBookingToReference: HoldingBookingConverter;
  onSkippedItem?: (item: {
    accountId: string;
    bookingId: string;
    bookingDescription?: string | null;
    transactionDescription?: string | null;
    transactionId: string | null;
    reason: "missingConversion" | "invalidExecutionPrice";
    date: Date;
  }) => void;
}): Promise<boolean> {
  if (
    !isMixedPeriodSameUnitHoldingTransfer({
      allNonExplicitAreHolding: args.allNonExplicitAreHolding,
      allNonExplicitInPeriod: args.allNonExplicitInPeriod,
      nonExplicitUnitIdentifiers: args.nonExplicitUnitIdentifiers,
    })
  ) {
    return false;
  }

  const convertedByBookingId = new Map<string, number | null>();
  const convertedValues = await Promise.all(
    args.inPeriodHoldingBookings.map((booking) =>
      args.convertBookingToReference({
        id: booking.id,
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

  let hasMissingConversion = false;
  for (let index = 0; index < args.inPeriodHoldingBookings.length; index += 1) {
    const booking = args.inPeriodHoldingBookings[index]!;
    const convertedValue = convertedValues[index];
    convertedByBookingId.set(booking.id, convertedValue);

    if (convertedValue == null) {
      hasMissingConversion = true;
      args.state.skippedCount += 1;
      args.onSkippedItem?.({
        accountId: booking.accountId,
        bookingId: booking.id,
        bookingDescription: booking.description,
        transactionDescription: booking.transactionDescription,
        transactionId: booking.transactionId ?? null,
        reason: "missingConversion",
        date: booking.date,
      });
    } else {
      args.state.convertedCount += 1;
    }
  }

  if (hasMissingConversion) {
    return true;
  }

  for (const booking of toSortedBookings(args.inPeriodHoldingBookings)) {
    if (Math.abs(booking.value) <= QUANTITY_EPSILON) {
      continue;
    }

    const convertedValue = convertedByBookingId.get(booking.id);
    if (convertedValue == null) {
      continue;
    }

    const executionUnitPriceInReference = convertedValue / booking.value;
    if (!Number.isFinite(executionUnitPriceInReference)) {
      args.state.skippedCount += 1;
      args.onSkippedItem?.({
        accountId: booking.accountId,
        bookingId: booking.id,
        bookingDescription: booking.description,
        transactionDescription: booking.transactionDescription,
        transactionId: booking.transactionId ?? null,
        reason: "invalidExecutionPrice",
        date: booking.date,
      });
      continue;
    }

    const accountState = args.state.stateByHoldingAccountId.get(
      booking.accountId,
    );
    if (!accountState || accountState.skipped) {
      continue;
    }

    applyNonRealizingExecutionToLots({
      lots: accountState.lots,
      quantity: booking.value,
      unitCostInReference: executionUnitPriceInReference,
      acquisitionSortKey: toLotAcquisitionSortKey({
        date: booking.date,
        bookingId: booking.id,
      }),
    });
  }

  return true;
}

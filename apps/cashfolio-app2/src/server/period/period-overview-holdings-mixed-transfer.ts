import {
  toMoney,
  type Money,
  MoneyDecimal,
  moneySubtract,
  moneyMultiply,
  moneyDivide,
  moneyAbs,
  moneyIsFinite,
} from "../../shared/money";
import {
  isNearZero,
  toLotAcquisitionSortKey,
  QUANTITY_EPSILON,
} from "./period-overview-holdings-common";
import { toHoldingUnitIdentifier } from "./period-overview-holdings-transfer";
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
  quantity: Money;
  unitCostInReference: Money;
  acquisitionSortKey: string;
}) {
  let remainingQuantity = args.quantity;

  while (
    !isNearZero(remainingQuantity) &&
    args.lots.length > 0 &&
    toMoney(remainingQuantity).comparedTo(0) !==
      toMoney(args.lots[0]!.quantity).comparedTo(0)
  ) {
    const lot = args.lots[0]!;
    const closeQuantity = MoneyDecimal.min(
      moneyAbs(remainingQuantity),
      moneyAbs(lot.quantity),
    );
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

function hasOpeningAcquisitionSortKey(acquisitionSortKey: string): boolean {
  return acquisitionSortKey.includes("::opening:");
}

function resolveOpeningUnitCostInReference(args: {
  state: HoldingGainLossWorkingState;
  unitIdentifier: string | null;
}): Money | null {
  if (!args.unitIdentifier) {
    return null;
  }

  for (const accountState of args.state.stateByHoldingAccountId.values()) {
    const accountUnitIdentifier = toHoldingUnitIdentifier({
      unit: accountState.account.unit,
      currency: accountState.account.currency,
      cryptocurrency: accountState.account.cryptocurrency,
      symbol: accountState.account.symbol,
      tradeCurrency: accountState.account.tradeCurrency,
    });

    if (accountUnitIdentifier !== args.unitIdentifier) {
      continue;
    }

    const openingLot = accountState.lots.find(
      (lot) =>
        hasOpeningAcquisitionSortKey(lot.acquisitionSortKey) &&
        !isNearZero(lot.quantity),
    );
    if (openingLot) {
      return openingLot.unitCostInReference;
    }
  }

  return null;
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

  const convertedByBookingId = new Map<string, Money | null>();
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

  const unitIdentifier =
    args.nonExplicitUnitIdentifiers.size === 1
      ? ([...args.nonExplicitUnitIdentifiers][0] ?? null)
      : null;
  const openingUnitCostInReference = resolveOpeningUnitCostInReference({
    state: args.state,
    unitIdentifier,
  });

  for (const booking of toSortedBookings(args.inPeriodHoldingBookings)) {
    if (moneyAbs(booking.value).comparedTo(QUANTITY_EPSILON) <= 0) {
      continue;
    }

    const convertedValue = convertedByBookingId.get(booking.id);
    if (convertedValue == null) {
      continue;
    }

    const executionUnitPriceInReference = moneyDivide(
      convertedValue,
      booking.value,
    );
    if (!moneyIsFinite(executionUnitPriceInReference)) {
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

    const lotMovementUnitCostInReference =
      toMoney(booking.value).comparedTo(QUANTITY_EPSILON) > 0 &&
      openingUnitCostInReference != null
        ? openingUnitCostInReference
        : executionUnitPriceInReference;

    applyNonRealizingExecutionToLots({
      lots: accountState.lots,
      quantity: booking.value,
      unitCostInReference: lotMovementUnitCostInReference,
      acquisitionSortKey: toLotAcquisitionSortKey({
        date: booking.date,
        bookingId: booking.id,
      }),
    });
  }

  return true;
}

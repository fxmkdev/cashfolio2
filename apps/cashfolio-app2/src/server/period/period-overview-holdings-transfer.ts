import {
  toMoney,
  type Money,
  MoneyDecimal,
  moneyAdd,
  moneySubtract,
  moneyMultiply,
  moneyAbs,
} from "../../shared/money";
import type { Unit } from "../../.prisma-client/enums";

import {
  QUANTITY_EPSILON,
  isNearZero,
} from "./period-overview-holdings-common";
import type {
  HoldingAccountState,
  HoldingLot,
  HoldingTransactionBooking,
} from "./period-overview-holdings-types";

export type HoldingTransferDirection = "LONG" | "SHORT";

export function toHoldingUnitIdentifier(input: {
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
}): string | null {
  if (input.unit === "CURRENCY") {
    return input.currency ? `currency:${input.currency.toUpperCase()}` : null;
  }
  if (input.unit === "CRYPTOCURRENCY") {
    return input.cryptocurrency
      ? `crypto:${input.cryptocurrency.toUpperCase()}`
      : null;
  }
  return input.symbol && input.tradeCurrency
    ? `security:${input.symbol.toUpperCase()}:${input.tradeCurrency.toUpperCase()}`
    : null;
}

function getOpenQuantityByLotSign(args: {
  lots: HoldingLot[];
  lotSign: 1 | -1;
}): Money {
  return args.lots.reduce(
    (sum, lot) =>
      moneyAdd(
        sum,
        toMoney(lot.quantity).comparedTo(0) === args.lotSign
          ? moneyAbs(lot.quantity)
          : 0,
      ),
    toMoney(0),
  );
}

function getPositiveOpenQuantity(lots: HoldingLot[]): Money {
  return getOpenQuantityByLotSign({
    lots,
    lotSign: 1,
  });
}

function drainTransferLots(args: {
  lots: HoldingLot[];
  quantity: Money;
  lotSign: 1 | -1;
}): HoldingLot[] {
  const drainedLots: HoldingLot[] = [];
  let remaining = args.quantity;

  while (
    toMoney(remaining).comparedTo(QUANTITY_EPSILON) > 0 &&
    args.lots.length > 0 &&
    toMoney(args.lots[0]!.quantity).comparedTo(0) === args.lotSign &&
    moneyAbs(args.lots[0]!.quantity).comparedTo(QUANTITY_EPSILON) > 0
  ) {
    const lot = args.lots[0]!;
    const movedMagnitude = MoneyDecimal.min(remaining, moneyAbs(lot.quantity));
    const movedQuantity = moneyMultiply(args.lotSign, movedMagnitude);

    drainedLots.push({
      quantity: movedQuantity,
      unitCostInReference: lot.unitCostInReference,
      acquisitionSortKey: lot.acquisitionSortKey,
    });

    lot.quantity = moneySubtract(lot.quantity, movedQuantity);
    remaining = moneySubtract(remaining, movedMagnitude);

    if (isNearZero(lot.quantity)) {
      args.lots.shift();
    }
  }

  return drainedLots;
}

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

export function resolveHoldingTransferDirection(args: {
  stateByHoldingAccountId: Map<string, HoldingAccountState>;
  holdingBookings: HoldingTransactionBooking[];
}): HoldingTransferDirection | null {
  const netByAccountId = new Map<string, Money>();
  let netQuantity: Money = toMoney(0);
  let hasPositive = false;
  let hasNegative = false;

  for (const booking of args.holdingBookings) {
    netByAccountId.set(
      booking.accountId,
      moneyAdd(
        netByAccountId.get(booking.accountId) ?? toMoney(0),
        booking.value,
      ),
    );
    netQuantity = moneyAdd(netQuantity, booking.value);
    if (toMoney(booking.value).comparedTo(QUANTITY_EPSILON) > 0) {
      hasPositive = true;
    } else if (toMoney(booking.value).comparedTo(-QUANTITY_EPSILON) < 0) {
      hasNegative = true;
    }
  }

  if (!hasPositive || !hasNegative || !isNearZero(netQuantity)) {
    return null;
  }

  let canTransferLong = true;
  for (const [accountId, netDelta] of netByAccountId) {
    if (toMoney(netDelta).comparedTo(-QUANTITY_EPSILON) >= 0) {
      continue;
    }

    const state = args.stateByHoldingAccountId.get(accountId);
    if (!state) {
      canTransferLong = false;
      break;
    }

    if (
      moneyAdd(
        getPositiveOpenQuantity(state.lots),
        QUANTITY_EPSILON,
      ).comparedTo(toMoney(netDelta).neg()) < 0
    ) {
      canTransferLong = false;
      break;
    }
  }

  let canTransferShort = true;
  for (const [accountId, netDelta] of netByAccountId) {
    if (toMoney(netDelta).comparedTo(QUANTITY_EPSILON) <= 0) {
      continue;
    }

    const state = args.stateByHoldingAccountId.get(accountId);
    if (!state) {
      canTransferShort = false;
      break;
    }

    if (
      moneyAdd(
        getOpenQuantityByLotSign({
          lots: state.lots,
          lotSign: -1,
        }),
        QUANTITY_EPSILON,
      ).comparedTo(netDelta) < 0
    ) {
      canTransferShort = false;
      break;
    }
  }

  if (canTransferLong === canTransferShort) {
    return null;
  }

  return canTransferLong ? "LONG" : "SHORT";
}

export function applyHoldingTransferWithoutRealization(args: {
  stateByHoldingAccountId: Map<string, HoldingAccountState>;
  holdingBookings: HoldingTransactionBooking[];
  direction: HoldingTransferDirection;
}) {
  const transferPool: HoldingLot[] = [];
  const lotSign = args.direction === "LONG" ? 1 : -1;

  const sortedBookings = [...args.holdingBookings].sort((left, right) => {
    const dateDiff = left.date.getTime() - right.date.getTime();
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return left.id.localeCompare(right.id, "en");
  });

  const sourceBookings = sortedBookings.filter((booking) =>
    args.direction === "LONG"
      ? toMoney(booking.value).comparedTo(-QUANTITY_EPSILON) < 0
      : toMoney(booking.value).comparedTo(QUANTITY_EPSILON) > 0,
  );
  const destinationBookings = sortedBookings.filter((booking) =>
    args.direction === "LONG"
      ? toMoney(booking.value).comparedTo(QUANTITY_EPSILON) > 0
      : toMoney(booking.value).comparedTo(-QUANTITY_EPSILON) < 0,
  );

  for (const booking of sourceBookings) {
    const state = args.stateByHoldingAccountId.get(booking.accountId);
    if (!state) {
      continue;
    }

    transferPool.push(
      ...drainTransferLots({
        lots: state.lots,
        quantity: moneyAbs(booking.value),
        lotSign,
      }),
    );
  }

  for (const booking of destinationBookings) {
    const state = args.stateByHoldingAccountId.get(booking.accountId);
    if (!state) {
      continue;
    }

    let remaining = moneyAbs(booking.value);
    while (
      toMoney(remaining).comparedTo(QUANTITY_EPSILON) > 0 &&
      transferPool.length > 0
    ) {
      const lot = transferPool[0]!;
      const movedMagnitude = MoneyDecimal.min(
        remaining,
        moneyAbs(lot.quantity),
      );
      const movedQuantity = moneyMultiply(
        toMoney(lot.quantity).comparedTo(0),
        movedMagnitude,
      );

      insertLotByAcquisitionOrder({
        lots: state.lots,
        lot: {
          quantity: movedQuantity,
          unitCostInReference: lot.unitCostInReference,
          acquisitionSortKey: lot.acquisitionSortKey,
        },
      });

      lot.quantity = moneySubtract(lot.quantity, movedQuantity);
      remaining = moneySubtract(remaining, movedMagnitude);

      if (isNearZero(lot.quantity)) {
        transferPool.shift();
      }
    }
  }
}

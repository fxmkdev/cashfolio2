import type { Unit } from "../.prisma-client/enums";
import { moneyAbs, moneyAdd, toMoneyNumber } from "../shared/money";
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
}): number {
  return args.lots.reduce(
    (sum, lot) =>
      toMoneyNumber(
        moneyAdd(
          sum,
          Math.sign(lot.quantity) === args.lotSign ? moneyAbs(lot.quantity) : 0,
        ),
      ),
    0,
  );
}

function getPositiveOpenQuantity(lots: HoldingLot[]): number {
  return getOpenQuantityByLotSign({
    lots,
    lotSign: 1,
  });
}

function drainTransferLots(args: {
  lots: HoldingLot[];
  quantity: number;
  lotSign: 1 | -1;
}): HoldingLot[] {
  const drainedLots: HoldingLot[] = [];
  let remaining = args.quantity;

  while (
    remaining > QUANTITY_EPSILON &&
    args.lots.length > 0 &&
    Math.sign(args.lots[0]!.quantity) === args.lotSign &&
    Math.abs(args.lots[0]!.quantity) > QUANTITY_EPSILON
  ) {
    const lot = args.lots[0]!;
    const movedMagnitude = Math.min(remaining, Math.abs(lot.quantity));
    const movedQuantity = args.lotSign * movedMagnitude;

    drainedLots.push({
      quantity: movedQuantity,
      unitCostInReference: lot.unitCostInReference,
      acquisitionSortKey: lot.acquisitionSortKey,
    });

    lot.quantity -= movedQuantity;
    remaining -= movedMagnitude;

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
  const netByAccountId = new Map<string, number>();
  let netQuantity = 0;
  let hasPositive = false;
  let hasNegative = false;

  for (const booking of args.holdingBookings) {
    netByAccountId.set(
      booking.accountId,
      toMoneyNumber(
        moneyAdd(netByAccountId.get(booking.accountId) ?? 0, booking.value),
      ),
    );
    netQuantity = toMoneyNumber(moneyAdd(netQuantity, booking.value));
    if (booking.value > QUANTITY_EPSILON) {
      hasPositive = true;
    } else if (booking.value < -QUANTITY_EPSILON) {
      hasNegative = true;
    }
  }

  if (!hasPositive || !hasNegative || !isNearZero(netQuantity)) {
    return null;
  }

  let canTransferLong = true;
  for (const [accountId, netDelta] of netByAccountId) {
    if (netDelta >= -QUANTITY_EPSILON) {
      continue;
    }

    const state = args.stateByHoldingAccountId.get(accountId);
    if (!state) {
      canTransferLong = false;
      break;
    }

    if (getPositiveOpenQuantity(state.lots) + QUANTITY_EPSILON < -netDelta) {
      canTransferLong = false;
      break;
    }
  }

  let canTransferShort = true;
  for (const [accountId, netDelta] of netByAccountId) {
    if (netDelta <= QUANTITY_EPSILON) {
      continue;
    }

    const state = args.stateByHoldingAccountId.get(accountId);
    if (!state) {
      canTransferShort = false;
      break;
    }

    if (
      getOpenQuantityByLotSign({
        lots: state.lots,
        lotSign: -1,
      }) +
        QUANTITY_EPSILON <
      netDelta
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
      ? booking.value < -QUANTITY_EPSILON
      : booking.value > QUANTITY_EPSILON,
  );
  const destinationBookings = sortedBookings.filter((booking) =>
    args.direction === "LONG"
      ? booking.value > QUANTITY_EPSILON
      : booking.value < -QUANTITY_EPSILON,
  );

  for (const booking of sourceBookings) {
    const state = args.stateByHoldingAccountId.get(booking.accountId);
    if (!state) {
      continue;
    }

    transferPool.push(
      ...drainTransferLots({
        lots: state.lots,
        quantity: Math.abs(booking.value),
        lotSign,
      }),
    );
  }

  for (const booking of destinationBookings) {
    const state = args.stateByHoldingAccountId.get(booking.accountId);
    if (!state) {
      continue;
    }

    let remaining = Math.abs(booking.value);
    while (remaining > QUANTITY_EPSILON && transferPool.length > 0) {
      const lot = transferPool[0]!;
      const movedMagnitude = Math.min(remaining, Math.abs(lot.quantity));
      const movedQuantity = Math.sign(lot.quantity) * movedMagnitude;

      insertLotByAcquisitionOrder({
        lots: state.lots,
        lot: {
          quantity: movedQuantity,
          unitCostInReference: lot.unitCostInReference,
          acquisitionSortKey: lot.acquisitionSortKey,
        },
      });

      lot.quantity -= movedQuantity;
      remaining -= movedMagnitude;

      if (isNearZero(lot.quantity)) {
        transferPool.shift();
      }
    }
  }
}

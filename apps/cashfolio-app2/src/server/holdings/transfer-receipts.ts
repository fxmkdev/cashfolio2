import type { Money } from "../../shared/money";
import {
  MoneyDecimal,
  moneyAbs,
  moneyAdd,
  moneyDivide,
  moneyMultiply,
  moneySubtract,
  toMoney,
} from "../../shared/money";
import { applyExecutionToLots } from "./lots";
import { isNearZero } from "./quantity-policy";
import type {
  HoldingAccountState,
  HoldingExecutionLotMatch,
  HoldingLot,
  HoldingTransactionBooking,
} from "./types";

type HoldingTransferReceiptArgs = {
  state: HoldingAccountState;
  booking: HoldingTransactionBooking;
  transferPool: HoldingLot[];
  captureLotMatches?: boolean;
};

/** Receive carried FIFO costs, closing opposite destination lots before opening any remainder. */
export function receiveHoldingTransfer(args: HoldingTransferReceiptArgs) {
  const { state, booking, transferPool } = args;
  let remaining = moneyAbs(booking.value);
  const totals: TransferReceiptTotals = {
    matchedQuantity: toMoney(0),
    effectiveReferenceAmount: toMoney(0),
    realizedGainLossDelta: toMoney(0),
    lotMatches: [],
  };
  const peers = booking.transferPeers?.map((peer) => ({ ...peer }));
  while (!isNearZero(remaining) && transferPool.length > 0) {
    const source = selectTransferReceiptSource(transferPool, peers);
    if (!source) break;
    const { poolIndex, carried, peer } = source;
    const sign = carried.quantity.comparedTo(0);
    const magnitude = MoneyDecimal.min(
      remaining,
      moneyAbs(carried.quantity),
      peer?.quantity ?? remaining,
    );
    const closedQuantity = closeOppositeTransferLots(
      args,
      carried,
      magnitude,
      totals,
    );
    const movedQuantity = moneyMultiply(sign, magnitude);
    insertTransferredRemainder(state, carried, movedQuantity, closedQuantity);
    carried.quantity = moneySubtract(carried.quantity, movedQuantity);
    remaining = moneySubtract(remaining, magnitude);
    if (peer) peer.quantity = moneySubtract(peer.quantity, magnitude);
    if (isNearZero(carried.quantity)) transferPool.splice(poolIndex, 1);
  }
  state.realizedGainLoss = moneyAdd(
    state.realizedGainLoss ?? toMoney(0),
    totals.realizedGainLossDelta,
  );
  appendTransferReceiptEvent(args, totals);
}

type TransferReceiptTotals = {
  matchedQuantity: Money;
  effectiveReferenceAmount: Money;
  realizedGainLossDelta: Money;
  lotMatches: HoldingExecutionLotMatch[];
};

function selectTransferReceiptSource(
  transferPool: HoldingLot[],
  peers: HoldingTransactionBooking["transferPeers"],
) {
  const poolIndex = peers
    ? transferPool.findIndex((lot) =>
        peers.some(
          (peer) =>
            peer.bookingId === lot.transferSourceBookingId &&
            !isNearZero(peer.quantity),
        ),
      )
    : 0;
  if (poolIndex < 0) return null;
  const carried = transferPool[poolIndex]!;
  const peer = peers?.find(
    (item) =>
      item.bookingId === carried.transferSourceBookingId &&
      !isNearZero(item.quantity),
  );
  return { poolIndex, carried, peer };
}

function closeOppositeTransferLots(
  args: HoldingTransferReceiptArgs,
  carried: HoldingLot,
  magnitude: Money,
  totals: TransferReceiptTotals,
): Money {
  const { state } = args;
  const sign = carried.quantity.comparedTo(0);
  const oppositeQuantity = state.lots.reduce(
    (sum, lot) =>
      lot.quantity.comparedTo(0) === -sign
        ? moneyAdd(sum, moneyAbs(lot.quantity))
        : sum,
    toMoney(0),
  );
  const closedQuantity = moneyMultiply(
    sign,
    MoneyDecimal.min(magnitude, oppositeQuantity),
  );
  if (!isNearZero(closedQuantity)) {
    const previousDelta = totals.realizedGainLossDelta;
    const delta = applyExecutionToLots({
      lots: state.lots,
      quantity: closedQuantity,
      executionUnitPriceInReference: carried.unitCostInReference,
      acquisitionSortKey: carried.acquisitionSortKey,
      ...(args.captureLotMatches !== false
        ? {
            onLotMatched: (match: HoldingExecutionLotMatch) => {
              totals.lotMatches.push({
                ...match,
                runningEventRealizedGainLoss: moneyAdd(
                  previousDelta,
                  match.runningEventRealizedGainLoss,
                ),
              });
            },
          }
        : {}),
    });
    totals.matchedQuantity = moneyAdd(totals.matchedQuantity, closedQuantity);
    totals.effectiveReferenceAmount = moneyAdd(
      totals.effectiveReferenceAmount,
      moneyMultiply(closedQuantity, carried.unitCostInReference),
    );
    totals.realizedGainLossDelta = moneyAdd(
      totals.realizedGainLossDelta,
      delta,
    );
  }

  return closedQuantity;
}

function insertTransferredRemainder(
  state: HoldingAccountState,
  carried: HoldingLot,
  movedQuantity: Money,
  closedQuantity: Money,
) {
  const residualQuantity = moneySubtract(movedQuantity, closedQuantity);
  if (!isNearZero(residualQuantity)) {
    const lot = {
      quantity: residualQuantity,
      unitCostInReference: carried.unitCostInReference,
      acquisitionSortKey: carried.acquisitionSortKey,
    };
    const index = state.lots.findIndex(
      (existing) => existing.acquisitionSortKey > lot.acquisitionSortKey,
    );
    if (index < 0) state.lots.push(lot);
    else state.lots.splice(index, 0, lot);
  }
}

function appendTransferReceiptEvent(
  args: HoldingTransferReceiptArgs,
  totals: TransferReceiptTotals,
) {
  const { state, booking } = args;
  if (!isNearZero(totals.matchedQuantity) && args.captureLotMatches !== false) {
    (state.processedExecutionEvents ??= []).push({
      accountId: state.account.id,
      bookingId: booking.id,
      bookingDescription: booking.description,
      transactionId: booking.transactionId ?? null,
      transactionDescription: booking.transactionDescription,
      date: booking.date,
      quantity: totals.matchedQuantity,
      pricingSource: "transferBasis",
      marketReferenceAmount: null,
      residualAllocationAmount: toMoney(0),
      effectiveReferenceAmount: totals.effectiveReferenceAmount,
      executionUnitPriceInReference: moneyDivide(
        totals.effectiveReferenceAmount,
        totals.matchedQuantity,
      ),
      realizedGainLossDelta: totals.realizedGainLossDelta,
      runningRealizedGainLoss: state.realizedGainLoss!,
      lotMatches: totals.lotMatches,
    });
  }
}

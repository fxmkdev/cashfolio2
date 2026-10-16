import {
  MoneyDecimal,
  moneyAbs,
  moneyAdd,
  moneyDivide,
  moneyMultiply,
  moneySubtract,
  toMoney,
} from "../../../shared/money";
import {
  applyExecutionToLots,
  isNearZero,
} from "./period-overview-holdings-common";
import type {
  HoldingAccountState,
  HoldingExecutionLotMatch,
  HoldingLot,
  HoldingTransactionBooking,
} from "./period-overview-holdings-types";

/** Receive carried FIFO costs, closing opposite destination lots before opening any remainder. */
export function receiveHoldingTransfer(args: {
  state: HoldingAccountState;
  booking: HoldingTransactionBooking;
  transferPool: HoldingLot[];
  captureLotMatches?: boolean;
}) {
  const { state, booking, transferPool } = args;
  let remaining = moneyAbs(booking.value);
  let matchedQuantity = toMoney(0);
  let effectiveReferenceAmount = toMoney(0);
  let realizedGainLossDelta = toMoney(0);
  const lotMatches: HoldingExecutionLotMatch[] = [];

  while (!isNearZero(remaining) && transferPool.length > 0) {
    const carried = transferPool[0]!;
    const sign = carried.quantity.comparedTo(0);
    const magnitude = MoneyDecimal.min(remaining, moneyAbs(carried.quantity));
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
      const previousDelta = realizedGainLossDelta;
      const delta = applyExecutionToLots({
        lots: state.lots,
        quantity: closedQuantity,
        executionUnitPriceInReference: carried.unitCostInReference,
        acquisitionSortKey: carried.acquisitionSortKey,
        ...(args.captureLotMatches !== false
          ? {
              onLotMatched: (match: HoldingExecutionLotMatch) => {
                lotMatches.push({
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
      matchedQuantity = moneyAdd(matchedQuantity, closedQuantity);
      effectiveReferenceAmount = moneyAdd(
        effectiveReferenceAmount,
        moneyMultiply(closedQuantity, carried.unitCostInReference),
      );
      realizedGainLossDelta = moneyAdd(realizedGainLossDelta, delta);
    }

    const movedQuantity = moneyMultiply(sign, magnitude);
    const residualQuantity = moneySubtract(movedQuantity, closedQuantity);
    if (!isNearZero(residualQuantity)) {
      const lot = { ...carried, quantity: residualQuantity };
      const index = state.lots.findIndex(
        (existing) => existing.acquisitionSortKey > lot.acquisitionSortKey,
      );
      if (index < 0) state.lots.push(lot);
      else state.lots.splice(index, 0, lot);
    }
    carried.quantity = moneySubtract(carried.quantity, movedQuantity);
    remaining = moneySubtract(remaining, magnitude);
    if (isNearZero(carried.quantity)) transferPool.shift();
  }

  state.realizedGainLoss = moneyAdd(
    state.realizedGainLoss ?? toMoney(0),
    realizedGainLossDelta,
  );
  if (!isNearZero(matchedQuantity) && args.captureLotMatches !== false) {
    (state.processedExecutionEvents ??= []).push({
      accountId: state.account.id,
      bookingId: booking.id,
      bookingDescription: booking.description,
      transactionId: booking.transactionId ?? null,
      transactionDescription: booking.transactionDescription,
      date: booking.date,
      quantity: matchedQuantity,
      pricingSource: "transferBasis",
      marketReferenceAmount: null,
      residualAllocationAmount: toMoney(0),
      effectiveReferenceAmount,
      executionUnitPriceInReference: moneyDivide(
        effectiveReferenceAmount,
        matchedQuantity,
      ),
      realizedGainLossDelta,
      runningRealizedGainLoss: state.realizedGainLoss,
      lotMatches,
    });
  }
}

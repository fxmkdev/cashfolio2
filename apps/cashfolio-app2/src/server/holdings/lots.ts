import {
  MoneyDecimal,
  moneyAbs,
  moneyAdd,
  moneyMultiply,
  moneySubtract,
  toMoney,
  type Money,
} from "../../shared/money";
import { isNearZero } from "./quantity-policy";
import type { HoldingExecutionLotMatch, HoldingLot } from "./types";

export function applyExecutionToLots(args: {
  lots: HoldingLot[];
  quantity: Money;
  executionUnitPriceInReference: Money;
  acquisitionSortKey: string;
  onLotMatched?: (match: HoldingExecutionLotMatch) => void;
}): Money {
  let realizedGainLoss: Money = toMoney(0);
  let remainingQuantity = args.quantity;

  while (
    !isNearZero(remainingQuantity) &&
    args.lots.length > 0 &&
    toMoney(remainingQuantity).comparedTo(0) !==
      toMoney(args.lots[0]!.quantity).comparedTo(0)
  ) {
    const lot = args.lots[0]!;
    const lotAcquisitionSortKey = lot.acquisitionSortKey;
    const lotUnitCostInReference = lot.unitCostInReference;
    const closeQuantity = MoneyDecimal.min(
      moneyAbs(remainingQuantity),
      moneyAbs(lot.quantity),
    );
    let lotRealizedGainLossDelta: Money = toMoney(0);

    if (
      toMoney(lot.quantity).comparedTo(0) > 0 &&
      toMoney(remainingQuantity).comparedTo(0) < 0
    ) {
      lotRealizedGainLossDelta = moneyMultiply(
        closeQuantity,
        moneySubtract(
          args.executionUnitPriceInReference,
          lotUnitCostInReference,
        ),
      );
    } else if (
      toMoney(lot.quantity).comparedTo(0) < 0 &&
      toMoney(remainingQuantity).comparedTo(0) > 0
    ) {
      lotRealizedGainLossDelta = moneyMultiply(
        closeQuantity,
        moneySubtract(
          lotUnitCostInReference,
          args.executionUnitPriceInReference,
        ),
      );
    }
    realizedGainLoss = moneyAdd(realizedGainLoss, lotRealizedGainLossDelta);
    args.onLotMatched?.({
      acquisitionSortKey: lotAcquisitionSortKey,
      matchedQuantity: closeQuantity,
      lotUnitCostInReference,
      executionUnitPriceInReference: args.executionUnitPriceInReference,
      realizedGainLossDelta: lotRealizedGainLossDelta,
      runningEventRealizedGainLoss: realizedGainLoss,
    });

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

  if (!isNearZero(remainingQuantity)) {
    args.lots.push({
      quantity: remainingQuantity,
      unitCostInReference: args.executionUnitPriceInReference,
      acquisitionSortKey: args.acquisitionSortKey,
    });
  }

  return realizedGainLoss;
}

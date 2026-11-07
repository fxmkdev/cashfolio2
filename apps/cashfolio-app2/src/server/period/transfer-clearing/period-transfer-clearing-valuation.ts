import {
  moneyAbs,
  moneyAdd,
  moneyMultiply,
  moneySubtract,
  toMoney,
  type Money,
} from "../../../shared/money";
import { QUANTITY_EPSILON } from "../../holdings/quantity-policy";
import type { HoldingLot } from "../../holdings/types";
import type {
  TransferClearingGainLossArgs,
  TransferClearingTotals,
  TransferClearingUnitState,
} from "./period-transfer-clearing-gain-loss-types";
import type { TransferClearingUnitBucket } from "./period-transfer-clearing-types";

export async function valueTransferClearingUnit(
  args: TransferClearingGainLossArgs,
  unitBucket: TransferClearingUnitBucket,
  unitState: TransferClearingUnitState,
  totals: TransferClearingTotals,
) {
  const { lots } = unitState;
  const openQuantity = lots.reduce(
    (sum, lot) => moneyAdd(sum, moneyAbs(lot.quantity)),
    toMoney(0),
  );
  if (toMoney(openQuantity).comparedTo(QUANTITY_EPSILON) > 0) {
    const periodEndRate = await args.resolveRate({
      unit: unitBucket.unit,
      currency: unitBucket.currency,
      cryptocurrency: unitBucket.cryptocurrency,
      symbol: unitBucket.symbol,
      tradeCurrency: unitBucket.tradeCurrency,
      date: args.periodEnd,
    });
    if (periodEndRate == null) {
      totals.skippedCount += 1;
      args.onSkippedItem?.({
        unitKey: unitBucket.unitKey,
        reason: "missingPeriodEndRate",
        date: args.periodEnd,
      });
    } else {
      const unitUnrealized = valueTransferClearingLots(
        args,
        unitBucket,
        lots,
        periodEndRate,
      );
      totals.unrealizedGainLoss = moneyAdd(
        totals.unrealizedGainLoss,
        unitUnrealized,
      );
      unitState.unrealizedGainLoss = moneyAdd(
        unitState.unrealizedGainLoss,
        unitUnrealized,
      );
    }
  }
}

function valueTransferClearingLots(
  args: TransferClearingGainLossArgs,
  unitBucket: TransferClearingUnitBucket,
  lots: HoldingLot[],
  periodEndRate: Money,
): Money {
  let unitUnrealized: Money = toMoney(0);
  for (const lot of lots) {
    const lotUnrealizedGainLoss = moneyMultiply(
      lot.quantity,
      moneySubtract(periodEndRate, lot.unitCostInReference),
    );
    unitUnrealized = moneyAdd(unitUnrealized, lotUnrealizedGainLoss);
    args.onUnitOpenLotValuation?.({
      unitKey: unitBucket.unitKey,
      acquisitionSortKey: lot.acquisitionSortKey,
      quantity: lot.quantity,
      unitCostInReference: lot.unitCostInReference,
      periodEndRate,
      unrealizedGainLoss: lotUnrealizedGainLoss,
    });
  }
  return unitUnrealized;
}

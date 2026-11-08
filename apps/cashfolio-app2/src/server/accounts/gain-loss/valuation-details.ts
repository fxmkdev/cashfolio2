import type { AccountGainLossResult } from "../../../shared/account-gain-loss";
import type {
  GainLossReconciliationOpenLot,
  GainLossReconciliationRealizedEvent,
} from "../../../shared/gain-loss-reconciliation";
import { moneyAdd, type Money } from "../../../shared/money";
import {
  parseAcquisitionSortKey,
  toRoundedOpenLot,
  toRoundedRealizedEvent,
} from "../../holdings/explain";
import type { HoldingGainLossFinalizationCallbacks } from "../../holdings/types";
export function createAccountValuationCallbacks(
  results: Map<string, AccountGainLossResult<Money>>,
  closingFailures: Set<string>,
  detailAccountId: string | undefined,
) {
  const realizedEvents: GainLossReconciliationRealizedEvent<Money>[] = [];
  const unrealizedOpenLots: GainLossReconciliationOpenLot<Money>[] = [];
  const unvaluedOpenLots: GainLossReconciliationOpenLot<Money, null>[] = [];

  const callbacks: HoldingGainLossFinalizationCallbacks = {
    onAccountGainLoss: (item) => {
      results.get(item.accountId)!.summary = {
        realizedGainLoss: item.realizedGainLoss,
        unrealizedGainLoss: item.unrealizedGainLoss,
        totalGainLoss: moneyAdd(item.realizedGainLoss, item.unrealizedGainLoss),
      };
    },
    ...createHoldingDetailCallbacks(
      detailAccountId,
      realizedEvents,
      unvaluedOpenLots,
      unrealizedOpenLots,
    ),
    onSkippedItem: (item) => {
      closingFailures.add(item.accountId);
      results.get(item.accountId)!.diagnostics.push({
        date: item.date.toISOString(),
        message:
          "Closing valuation is unavailable. Realised G/L remains available.",
      });
    },
  };
  return { callbacks, realizedEvents, unrealizedOpenLots, unvaluedOpenLots };
}

function createHoldingDetailCallbacks(
  detailAccountId: string | undefined,
  realizedEvents: GainLossReconciliationRealizedEvent<Money>[],
  unvaluedOpenLots: GainLossReconciliationOpenLot<Money, null>[],
  unrealizedOpenLots: GainLossReconciliationOpenLot<Money>[],
): Pick<
  HoldingGainLossFinalizationCallbacks,
  | "onAccountExecutionEvent"
  | "onAccountUnvaluedOpenLot"
  | "onAccountOpenLotValuation"
> {
  return {
    onAccountExecutionEvent: detailAccountId
      ? (event) => {
          if (event.accountId === detailAccountId)
            realizedEvents.push(toRoundedRealizedEvent(event, false));
        }
      : undefined,
    onAccountUnvaluedOpenLot: detailAccountId
      ? (lot) => {
          if (lot.accountId === detailAccountId)
            unvaluedOpenLots.push({
              id: `lot:${lot.acquisitionSortKey}`,
              ...parseAcquisitionSortKey(lot.acquisitionSortKey),
              acquisitionSortKey: lot.acquisitionSortKey,
              quantity: lot.quantity,
              unitCostInReference: lot.unitCostInReference,
              periodEndRate: null,
              unrealizedGainLoss: null,
              runningUnrealizedGainLoss: null,
            });
        }
      : undefined,
    onAccountOpenLotValuation: detailAccountId
      ? (lot) => {
          if (lot.accountId === detailAccountId)
            unrealizedOpenLots.push(toRoundedOpenLot(lot, false));
        }
      : undefined,
  };
}

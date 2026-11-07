import type {
  GainLossReconciliationDetails,
  GainLossReconciliationDiagnostic,
  GainLossReconciliationOpenLot,
  GainLossReconciliationRealizedEvent,
} from "../../../shared/gain-loss-reconciliation";
import { type Money } from "../../../shared/money";
import {
  addRunningUnrealizedGainLoss,
  toRoundedOpenLot,
  toRoundedRealizedEvent,
} from "../../holdings/explain";
import type {
  HoldingExecutionExplainInput,
  HoldingOpenLotExplainInput,
  HoldingSkippedItem,
} from "../../holdings/types";
import { toNumericMoney } from "../../money-boundary";
import type { PeriodBaseData } from "../base-data/period-base-data-types";
import {
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
} from "../period-conversion";
import { formatUnitLabel, normalizeUppercaseCode } from "../period-unit-format";
import {
  computeTransferClearingGainLossSplit,
  type TransferClearingUnitBucket,
} from "../transfer-clearing/period-transfer-clearing";
import {
  pushDiagnostic,
  toEmptySummary,
  toSummary,
  toVirtualTransferClearingAccountId,
} from "./period-gain-loss-reconciliation-shared";

function findTargetVirtualUnitBucket(args: {
  accountId: string;
  unitBuckets: TransferClearingUnitBucket[];
}): TransferClearingUnitBucket | null {
  for (const unitBucket of args.unitBuckets) {
    if (
      toVirtualTransferClearingAccountId(unitBucket.unitKey) === args.accountId
    ) {
      return unitBucket;
    }
  }
  return null;
}

type TransferClearingReconciliationArgs = {
  baseData: PeriodBaseData;
  accountId: string;
  exchangeRateByKey?: Map<string, Promise<Money | null>>;
};

export async function buildTransferClearingReconciliation(
  args: TransferClearingReconciliationArgs,
): Promise<GainLossReconciliationDetails | null> {
  const { selection, transferClearingUnitBuckets } = args.baseData;
  const targetBucket = findTargetVirtualUnitBucket({
    accountId: args.accountId,
    unitBuckets: transferClearingUnitBuckets,
  });
  if (!targetBucket || !targetBucket.isNonReferenceUnit) {
    return null;
  }

  const diagnostics: GainLossReconciliationDiagnostic[] = [];
  const realizedEvents: GainLossReconciliationRealizedEvent<Money>[] = [];
  const unrealizedOpenLots: GainLossReconciliationOpenLot<Money>[] = [];

  if (selection.isBeforeAccountBookStart) {
    return toNumericMoney({
      target: toTransferClearingReconciliationTarget(
        args.accountId,
        targetBucket,
      ),
      summary: toEmptySummary(),
      skippedCount: 0,
      realizedEvents,
      unrealizedOpenLots,
      diagnostics,
    });
  }

  const split = await calculateTransferClearingReconciliation(
    args,
    targetBucket,
    diagnostics,
    realizedEvents,
    unrealizedOpenLots,
  );

  return toNumericMoney({
    target: toTransferClearingReconciliationTarget(
      args.accountId,
      targetBucket,
    ),
    summary: toSummary({
      realizedGainLoss: split.realizedGainLoss,
      unrealizedGainLoss: split.unrealizedGainLoss,
    }),
    skippedCount: split.skippedCount,
    realizedEvents,
    unrealizedOpenLots: addRunningUnrealizedGainLoss(unrealizedOpenLots),
    diagnostics,
  });
}

function toTransferClearingReconciliationTarget(
  accountId: string,
  targetBucket: TransferClearingUnitBucket,
) {
  return {
    accountId: accountId,
    accountName: targetBucket.unitLabel,
    isVirtual: true,
    unit: targetBucket.unit,
    unitLabel: formatUnitLabel(targetBucket),
    currency: normalizeUppercaseCode(targetBucket.currency),
    cryptocurrency: normalizeUppercaseCode(targetBucket.cryptocurrency),
    symbol: normalizeUppercaseCode(targetBucket.symbol),
    tradeCurrency: normalizeUppercaseCode(targetBucket.tradeCurrency),
  };
}

function createTransferClearingExplainCallbacks(
  diagnostics: GainLossReconciliationDiagnostic[],
  realizedEvents: GainLossReconciliationRealizedEvent<Money>[],
  unrealizedOpenLots: GainLossReconciliationOpenLot<Money>[],
) {
  return {
    onUnitExecutionEvent: (event: HoldingExecutionExplainInput) => {
      realizedEvents.push(toRoundedRealizedEvent(event));
    },
    onUnitOpenLotValuation: (lot: HoldingOpenLotExplainInput) => {
      unrealizedOpenLots.push(toRoundedOpenLot(lot));
    },
    onSkippedItem: (item: Omit<HoldingSkippedItem, "accountId">) => {
      pushDiagnostic(diagnostics, {
        reason: item.reason,
        date: item.date,
        bookingId: item.bookingId,
        bookingDescription: item.bookingDescription,
        transactionId: item.transactionId,
        transactionDescription: item.transactionDescription,
      });
    },
  };
}

async function calculateTransferClearingReconciliation(
  args: TransferClearingReconciliationArgs,
  targetBucket: TransferClearingUnitBucket,
  diagnostics: GainLossReconciliationDiagnostic[],
  realizedEvents: GainLossReconciliationRealizedEvent<Money>[],
  unrealizedOpenLots: GainLossReconciliationOpenLot<Money>[],
) {
  const { selection, referenceCurrency } = args.baseData;
  const exchangeRateByKey =
    args.exchangeRateByKey ?? new Map<string, Promise<Money | null>>();
  const split = await computeTransferClearingGainLossSplit({
    unitBuckets: [targetBucket],
    periodStart: selection.from,
    periodEndExclusive: selection.queryEndExclusive,
    initialRateDate: selection.initialHoldingDate,
    periodEnd: selection.to,
    resolveRate: (input) =>
      getUnitToReferenceExchangeRate({
        ...input,
        referenceCurrency,
        exchangeRateByKey,
      }),
    convertBookingToReference: (booking) =>
      convertBookingValueToReference({
        ...booking,
        referenceCurrency,
        exchangeRateByKey,
      }),
    ...createTransferClearingExplainCallbacks(
      diagnostics,
      realizedEvents,
      unrealizedOpenLots,
    ),
  });
  return split;
}

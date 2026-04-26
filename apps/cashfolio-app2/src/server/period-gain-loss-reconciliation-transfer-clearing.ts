import {
  computeTransferClearingGainLossSplit,
  loadTransferClearingUnitBuckets,
  type TransferClearingUnitBucket,
} from "./period-transfer-clearing";
import {
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
} from "./period-conversion";
import {
  addRunningUnrealizedGainLoss,
  pushDiagnostic,
  toEmptySummary,
  toRoundedOpenLot,
  toRoundedRealizedEvent,
  toSummary,
  toVirtualTransferClearingAccountId,
} from "./period-gain-loss-reconciliation-shared";
import type {
  GainLossReconciliationDetails,
  GainLossReconciliationDiagnostic,
  GainLossReconciliationOpenLot,
  GainLossReconciliationRealizedEvent,
} from "./period-gain-loss-reconciliation-types";
import { formatUnitLabel, normalizeUppercaseCode } from "./period-unit-format";

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

export async function buildTransferClearingReconciliation(args: {
  accountBookId: string;
  accountId: string;
  queryStart: Date;
  queryEndExclusive: Date;
  initialHoldingDate: Date;
  periodEnd: Date;
  referenceCurrency: string;
  isBeforeAccountBookStart: boolean;
}): Promise<GainLossReconciliationDetails | null> {
  const unitBuckets = await loadTransferClearingUnitBuckets({
    accountBookId: args.accountBookId,
    periodEndExclusive: args.queryEndExclusive,
    referenceCurrency: args.referenceCurrency,
  });
  const targetBucket = findTargetVirtualUnitBucket({
    accountId: args.accountId,
    unitBuckets,
  });
  if (!targetBucket || !targetBucket.isNonReferenceUnit) {
    return null;
  }

  const diagnostics: GainLossReconciliationDiagnostic[] = [];
  const realizedEvents: GainLossReconciliationRealizedEvent[] = [];
  const unrealizedOpenLots: GainLossReconciliationOpenLot[] = [];

  if (args.isBeforeAccountBookStart) {
    return {
      target: {
        accountId: args.accountId,
        accountName: targetBucket.unitLabel,
        isVirtual: true,
        unit: targetBucket.unit,
        unitLabel: formatUnitLabel(targetBucket),
        currency: normalizeUppercaseCode(targetBucket.currency),
        cryptocurrency: normalizeUppercaseCode(targetBucket.cryptocurrency),
        symbol: normalizeUppercaseCode(targetBucket.symbol),
        tradeCurrency: normalizeUppercaseCode(targetBucket.tradeCurrency),
      },
      summary: toEmptySummary(),
      skippedCount: 0,
      realizedEvents,
      unrealizedOpenLots,
      diagnostics,
    };
  }

  const exchangeRateByKey = new Map<string, Promise<number | null>>();
  const split = await computeTransferClearingGainLossSplit({
    unitBuckets: [targetBucket],
    periodStart: args.queryStart,
    periodEndExclusive: args.queryEndExclusive,
    initialRateDate: args.initialHoldingDate,
    periodEnd: args.periodEnd,
    resolveRate: (input) =>
      getUnitToReferenceExchangeRate({
        ...input,
        referenceCurrency: args.referenceCurrency,
        exchangeRateByKey,
      }),
    convertBookingToReference: (booking) =>
      convertBookingValueToReference({
        ...booking,
        referenceCurrency: args.referenceCurrency,
        exchangeRateByKey,
      }),
    onUnitExecutionEvent: (event) => {
      realizedEvents.push(toRoundedRealizedEvent(event));
    },
    onUnitOpenLotValuation: (lot) => {
      unrealizedOpenLots.push(toRoundedOpenLot(lot));
    },
    onSkippedItem: (item) => {
      pushDiagnostic(diagnostics, {
        reason: item.reason,
        date: item.date,
        bookingId: item.bookingId,
        bookingDescription: item.bookingDescription,
        transactionId: item.transactionId,
        transactionDescription: item.transactionDescription,
      });
    },
  });

  return {
    target: {
      accountId: args.accountId,
      accountName: targetBucket.unitLabel,
      isVirtual: true,
      unit: targetBucket.unit,
      unitLabel: formatUnitLabel(targetBucket),
      currency: normalizeUppercaseCode(targetBucket.currency),
      cryptocurrency: normalizeUppercaseCode(targetBucket.cryptocurrency),
      symbol: normalizeUppercaseCode(targetBucket.symbol),
      tradeCurrency: normalizeUppercaseCode(targetBucket.tradeCurrency),
    },
    summary: toSummary({
      realizedGainLoss: split.realizedGainLoss,
      unrealizedGainLoss: split.unrealizedGainLoss,
    }),
    skippedCount: split.skippedCount,
    realizedEvents,
    unrealizedOpenLots: addRunningUnrealizedGainLoss(unrealizedOpenLots),
    diagnostics,
  };
}

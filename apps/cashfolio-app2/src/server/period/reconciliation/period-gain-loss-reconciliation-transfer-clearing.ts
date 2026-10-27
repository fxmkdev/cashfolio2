import type { PeriodBaseData } from "../base-data/period-base-data-types";
import { toNumericMoney } from "../../money-boundary";
import { type Money } from "../../../shared/money";
import {
  computeTransferClearingGainLossSplit,
  type TransferClearingUnitBucket,
} from "../transfer-clearing/period-transfer-clearing";
import {
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
} from "../period-conversion";
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
import { formatUnitLabel, normalizeUppercaseCode } from "../period-unit-format";

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
  baseData: PeriodBaseData;
  accountId: string;
  exchangeRateByKey?: Map<string, Promise<Money | null>>;
}): Promise<GainLossReconciliationDetails | null> {
  const { selection, referenceCurrency, transferClearingUnitBuckets } =
    args.baseData;
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
    });
  }

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

  return toNumericMoney({
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
  });
}

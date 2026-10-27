import { toNumericMoney } from "../../money-boundary";
import { toMoney, type Money, moneyAdd } from "../../../shared/money";
import type { PeriodBaseData } from "../base-data/period-base-data-types";

import {
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
} from "../period-conversion";
import {
  applyHoldingTransactionsToGainLossState,
  finalizeHoldingGainLossState,
  initializeHoldingGainLossState,
} from "../holdings/period-overview-holdings";
import {
  addRunningUnrealizedGainLoss,
  pushDiagnostic,
  toEmptySummary,
  toRoundedOpenLot,
  toRoundedRealizedEvent,
  toSummary,
} from "./period-gain-loss-reconciliation-shared";
import type {
  GainLossReconciliationDetails,
  GainLossReconciliationDiagnostic,
  GainLossReconciliationOpenLot,
  GainLossReconciliationRealizedEvent,
} from "./period-gain-loss-reconciliation-types";
import { formatUnitLabel, normalizeUppercaseCode } from "../period-unit-format";

export async function buildRealAccountReconciliation(args: {
  baseData: PeriodBaseData;
  accountId: string;
  exchangeRateByKey?: Map<string, Promise<Money | null>>;
}): Promise<GainLossReconciliationDetails | null> {
  const { baseData } = args;
  const { selection, referenceCurrency } = baseData;
  const account = baseData.baseAssetLiabilityAccounts.find(
    (account) => account.id === args.accountId,
  );

  if (!account) {
    return null;
  }

  const targetAccount = baseData.holdingAccountsResolved.find(
    (account) => account.id === args.accountId,
  );
  if (!targetAccount) {
    return toNumericMoney(null);
  }

  const diagnostics: GainLossReconciliationDiagnostic[] = [];
  const realizedEvents: GainLossReconciliationRealizedEvent<Money>[] = [];
  const unrealizedOpenLots: GainLossReconciliationOpenLot<Money>[] = [];

  if (selection.isBeforeAccountBookStart) {
    return toNumericMoney({
      target: {
        accountId: targetAccount.id,
        accountName: account.name,
        isVirtual: false,
        unit: targetAccount.unit,
        unitLabel: formatUnitLabel(targetAccount),
        currency: normalizeUppercaseCode(targetAccount.currency),
        cryptocurrency: normalizeUppercaseCode(targetAccount.cryptocurrency),
        symbol: normalizeUppercaseCode(targetAccount.symbol),
        tradeCurrency: normalizeUppercaseCode(targetAccount.tradeCurrency),
      },
      summary: toEmptySummary(),
      skippedCount: 0,
      realizedEvents,
      unrealizedOpenLots,
      diagnostics,
    });
  }

  const initialHoldingBalanceByAccountId = new Map(
    baseData.initialHoldingBalances.map((balance) => [
      balance.accountId,
      balance.rawBalance,
    ]),
  );

  const exchangeRateByKey =
    args.exchangeRateByKey ?? new Map<string, Promise<Money | null>>();
  let targetSkippedCount = 0;
  let targetRealizedGainLoss: Money = toMoney(0);
  let targetUnrealizedGainLoss: Money = toMoney(0);

  const state = await initializeHoldingGainLossState({
    holdingAccounts: baseData.holdingAccountsResolved,
    initialBalanceByAccountId: initialHoldingBalanceByAccountId,
    initialRateDate: selection.initialHoldingDate,
    resolveRate: (input) =>
      getUnitToReferenceExchangeRate({
        ...input,
        referenceCurrency,
        exchangeRateByKey,
      }),
    onSkippedItem: (item) => {
      if (item.accountId !== targetAccount.id) {
        return;
      }
      targetSkippedCount += 1;
      pushDiagnostic(diagnostics, item);
    },
  });

  await applyHoldingTransactionsToGainLossState({
    state,
    transactions: baseData.holdingTransactions,
    periodStart: selection.from,
    periodEndExclusive: selection.queryEndExclusive,
    convertBookingToReference: (booking) =>
      convertBookingValueToReference({
        ...booking,
        referenceCurrency,
        exchangeRateByKey,
      }),
    onSkippedItem: (item) => {
      if (item.accountId !== targetAccount.id) return;
      targetSkippedCount += 1;
      pushDiagnostic(diagnostics, item);
    },
  });

  await finalizeHoldingGainLossState({
    state,
    periodEnd: selection.to,
    resolveRate: (input) =>
      getUnitToReferenceExchangeRate({
        ...input,
        referenceCurrency,
        exchangeRateByKey,
      }),
    onAccountGainLoss: (gainLossByAccount) => {
      if (gainLossByAccount.accountId !== targetAccount.id) {
        return;
      }
      targetRealizedGainLoss = moneyAdd(
        targetRealizedGainLoss,
        gainLossByAccount.realizedGainLoss,
      );
      targetUnrealizedGainLoss = moneyAdd(
        targetUnrealizedGainLoss,
        gainLossByAccount.unrealizedGainLoss,
      );
    },
    onAccountExecutionEvent: (event) => {
      if (event.accountId !== targetAccount.id) {
        return;
      }
      realizedEvents.push(toRoundedRealizedEvent(event));
    },
    onAccountOpenLotValuation: (lot) => {
      if (lot.accountId !== targetAccount.id) {
        return;
      }
      unrealizedOpenLots.push(toRoundedOpenLot(lot));
    },
    onSkippedItem: (item) => {
      if (item.accountId !== targetAccount.id) {
        return;
      }
      targetSkippedCount += 1;
      pushDiagnostic(diagnostics, item);
    },
  });

  return toNumericMoney({
    target: {
      accountId: targetAccount.id,
      accountName: account.name,
      isVirtual: false,
      unit: targetAccount.unit,
      unitLabel: formatUnitLabel(targetAccount),
      currency: normalizeUppercaseCode(targetAccount.currency),
      cryptocurrency: normalizeUppercaseCode(targetAccount.cryptocurrency),
      symbol: normalizeUppercaseCode(targetAccount.symbol),
      tradeCurrency: normalizeUppercaseCode(targetAccount.tradeCurrency),
    },
    summary: toSummary({
      realizedGainLoss: targetRealizedGainLoss,
      unrealizedGainLoss: targetUnrealizedGainLoss,
    }),
    skippedCount: targetSkippedCount,
    realizedEvents,
    unrealizedOpenLots: addRunningUnrealizedGainLoss(unrealizedOpenLots),
    diagnostics,
  });
}

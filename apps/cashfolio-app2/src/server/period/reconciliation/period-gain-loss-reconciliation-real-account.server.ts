import { moneyAdd, toMoney, type Money } from "../../../shared/money";
import { computeHoldingGainLossSplit } from "../../holdings/engine.server";
import type {
  HoldingGainLossFinalizationCallbacks,
  HoldingRateConvertibleAccount,
} from "../../holdings/types";
import { toNumericMoney } from "../../money-boundary";
import type { PeriodBaseData } from "../base-data/period-base-data-types";

import type {
  GainLossReconciliationDetails,
  GainLossReconciliationDiagnostic,
  GainLossReconciliationOpenLot,
  GainLossReconciliationRealizedEvent,
} from "../../../shared/reporting/gain-loss-reconciliation";
import {
  addRunningUnrealizedGainLoss,
  toRoundedOpenLot,
  toRoundedRealizedEvent,
} from "../../holdings/explain";
import {
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
} from "../period-conversion.server";
import { formatUnitLabel, normalizeUppercaseCode } from "../period-unit-format";
import {
  pushDiagnostic,
  toEmptySummary,
  toSummary,
} from "./period-gain-loss-reconciliation-shared";

type RealAccountReconciliationArgs = {
  baseData: PeriodBaseData;
  accountId: string;
  exchangeRateByKey?: Map<string, Promise<Money | null>>;
};

export async function buildRealAccountReconciliation(
  args: RealAccountReconciliationArgs,
): Promise<GainLossReconciliationDetails | null> {
  const { baseData } = args;
  const { selection } = baseData;
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
      target: toRealReconciliationTarget(account, targetAccount),
      summary: toEmptySummary(),
      skippedCount: 0,
      realizedEvents,
      unrealizedOpenLots,
      diagnostics,
    });
  }

  const collector = await collectRealAccountReconciliation(
    args,
    targetAccount,
    diagnostics,
    realizedEvents,
    unrealizedOpenLots,
  );

  return toNumericMoney({
    target: toRealReconciliationTarget(account, targetAccount),
    summary: toSummary({
      realizedGainLoss: collector.values.targetRealizedGainLoss,
      unrealizedGainLoss: collector.values.targetUnrealizedGainLoss,
    }),
    skippedCount: collector.values.targetSkippedCount,
    realizedEvents,
    unrealizedOpenLots: addRunningUnrealizedGainLoss(unrealizedOpenLots),
    diagnostics,
  });
}

function toRealReconciliationTarget(
  account: { name: string },
  targetAccount: HoldingRateConvertibleAccount,
) {
  return {
    accountId: targetAccount.id,
    accountName: account.name,
    isVirtual: false,
    unit: targetAccount.unit,
    unitLabel: formatUnitLabel(targetAccount),
    currency: normalizeUppercaseCode(targetAccount.currency),
    cryptocurrency: normalizeUppercaseCode(targetAccount.cryptocurrency),
    symbol: normalizeUppercaseCode(targetAccount.symbol),
    tradeCurrency: normalizeUppercaseCode(targetAccount.tradeCurrency),
  };
}

function createRealAccountExplainCollector(
  targetAccountId: string,
  diagnostics: GainLossReconciliationDiagnostic[],
  realizedEvents: GainLossReconciliationRealizedEvent<Money>[],
  unrealizedOpenLots: GainLossReconciliationOpenLot<Money>[],
) {
  const values = {
    targetSkippedCount: 0,
    targetRealizedGainLoss: toMoney(0),
    targetUnrealizedGainLoss: toMoney(0),
  };
  const callbacks: HoldingGainLossFinalizationCallbacks = {
    onAccountGainLoss: (gainLossByAccount) => {
      if (gainLossByAccount.accountId !== targetAccountId) {
        return;
      }
      values.targetRealizedGainLoss = moneyAdd(
        values.targetRealizedGainLoss,
        gainLossByAccount.realizedGainLoss,
      );
      values.targetUnrealizedGainLoss = moneyAdd(
        values.targetUnrealizedGainLoss,
        gainLossByAccount.unrealizedGainLoss,
      );
    },
    onAccountExecutionEvent: (event) => {
      if (event.accountId !== targetAccountId) {
        return;
      }
      realizedEvents.push(toRoundedRealizedEvent(event));
    },
    onAccountOpenLotValuation: (lot) => {
      if (lot.accountId !== targetAccountId) {
        return;
      }
      unrealizedOpenLots.push(toRoundedOpenLot(lot));
    },
    onSkippedItem: (item) => {
      if (item.accountId !== targetAccountId) {
        return;
      }
      values.targetSkippedCount += 1;
      pushDiagnostic(diagnostics, item);
    },
  };
  return { values, callbacks };
}

async function collectRealAccountReconciliation(
  args: RealAccountReconciliationArgs,
  targetAccount: HoldingRateConvertibleAccount,
  diagnostics: GainLossReconciliationDiagnostic[],
  realizedEvents: GainLossReconciliationRealizedEvent<Money>[],
  unrealizedOpenLots: GainLossReconciliationOpenLot<Money>[],
) {
  const { baseData } = args;
  const { selection, referenceCurrency } = baseData;
  const initialHoldingBalanceByAccountId = new Map(
    baseData.initialHoldingBalances.map((balance) => [
      balance.accountId,
      balance.rawBalance,
    ]),
  );

  const exchangeRateByKey =
    args.exchangeRateByKey ?? new Map<string, Promise<Money | null>>();
  const collector = createRealAccountExplainCollector(
    targetAccount.id,
    diagnostics,
    realizedEvents,
    unrealizedOpenLots,
  );
  await computeHoldingGainLossSplit({
    holdingAccounts: baseData.holdingAccountsResolved,
    initialBalanceByAccountId: initialHoldingBalanceByAccountId,
    initialRateDate: selection.initialHoldingDate,
    transactions: baseData.holdingTransactions,
    periodStart: selection.from,
    periodEndExclusive: selection.queryEndExclusive,
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
    ...collector.callbacks,
  });
  return collector;
}

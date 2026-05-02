import { convertBookingValueToReference } from "./period-conversion";
import {
  computeEndOfPeriodBalanceStatsWithConvertedBalances,
  type EndOfPeriodBalanceAccount,
} from "./period-balance-stats";
import { type PeriodEndNetWorthResult } from "./period-end-net-worth.types";
import {
  getOrLoadPeriodBaseData,
  type PeriodBaseData,
} from "./period-base-data-cache";
import { buildTransferClearingVirtualHierarchy } from "./period-transfer-clearing";

export async function loadPeriodEndNetWorth(args: {
  accountBookId: string;
  period?: unknown;
  baseData?: PeriodBaseData;
}): Promise<PeriodEndNetWorthResult> {
  const baseData =
    args.baseData ??
    (await getOrLoadPeriodBaseData({
      accountBookId: args.accountBookId,
      period: args.period,
    }));

  const endOfPeriodRawBalanceByAccountId = new Map(
    baseData.endOfPeriodRawBalances.map((balance) => [
      balance.accountId,
      balance.rawBalance,
    ]),
  );

  const {
    virtualAccounts: transferClearingVirtualAccounts,
    rawBalanceByVirtualAccountId,
  } = buildTransferClearingVirtualHierarchy({
    unitBuckets: baseData.transferClearingUnitBuckets,
  });

  for (const [accountId, rawBalance] of rawBalanceByVirtualAccountId) {
    endOfPeriodRawBalanceByAccountId.set(accountId, rawBalance);
  }

  const assetLiabilityAccounts: EndOfPeriodBalanceAccount[] = [
    ...baseData.baseAssetLiabilityAccounts,
    ...transferClearingVirtualAccounts,
  ];

  const exchangeRateByKey = new Map<string, Promise<number | null>>();
  const endOfPeriodBalanceStats =
    await computeEndOfPeriodBalanceStatsWithConvertedBalances({
      accounts: assetLiabilityAccounts,
      rawBalanceByAccountId: endOfPeriodRawBalanceByAccountId,
      periodEnd: baseData.selection.to,
      referenceCurrency: baseData.referenceCurrency,
      convertBalanceToReference: async (input) =>
        convertBookingValueToReference({
          ...input,
          exchangeRateByKey,
        }),
    });

  return {
    selectedPeriodValue: baseData.selection.periodValue,
    endOfPeriodNetWorth: endOfPeriodBalanceStats.netWorth,
    skippedCount: endOfPeriodBalanceStats.skippedCount,
  };
}

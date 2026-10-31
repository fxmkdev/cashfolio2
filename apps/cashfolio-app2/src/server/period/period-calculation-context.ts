import type { PeriodBaseData } from "./base-data/period-base-data-types";
import { buildTransferClearingVirtualHierarchy } from "./transfer-clearing/period-transfer-clearing-hierarchy";

/** G/L can have activity on a clearing account whose closing balance is zero. */
export function prepareGainLossStructure(
  baseData: Pick<
    PeriodBaseData,
    | "baseAssetLiabilityAccounts"
    | "allAccountGroups"
    | "transferClearingUnitBuckets"
  >,
) {
  const { virtualAccounts, virtualGroups } =
    buildTransferClearingVirtualHierarchy({
      unitBuckets: baseData.transferClearingUnitBuckets,
      includeZeroBalances: true,
    });
  return {
    accounts: [...baseData.baseAssetLiabilityAccounts, ...virtualAccounts],
    groupById: new Map(
      [...baseData.allAccountGroups, ...virtualGroups].map((group) => [
        group.id,
        group,
      ]),
    ),
  };
}

/** Build per-calculation maps without changing the cached base data. */
export function preparePeriodCalculationContext(
  baseData: Pick<
    PeriodBaseData,
    | "baseAssetLiabilityAccounts"
    | "endOfPeriodRawBalances"
    | "allAccountGroups"
    | "transferClearingUnitBuckets"
  >,
) {
  const assetLiabilityAccountNameById = new Map(
    baseData.baseAssetLiabilityAccounts.map((account) => [
      account.id,
      account.name,
    ]),
  );

  const endOfPeriodRawBalanceByAccountId = new Map(
    baseData.endOfPeriodRawBalances.map((balance) => [
      balance.accountId,
      balance.rawBalance,
    ]),
  );

  const {
    virtualGroups: transferClearingVirtualGroups,
    virtualAccounts: transferClearingVirtualAccounts,
    rawBalanceByVirtualAccountId,
  } = buildTransferClearingVirtualHierarchy({
    unitBuckets: baseData.transferClearingUnitBuckets,
  });

  const transferClearingUnitLabelByHoldingAccountId = new Map(
    baseData.transferClearingUnitBuckets
      .filter((bucket) => bucket.isNonReferenceUnit)
      .map((bucket) => [
        `virtual:transfer-clearing:account:${bucket.unitKey}`,
        bucket.unitLabel,
      ]),
  );
  const transferClearingHoldingAccounts = baseData.transferClearingUnitBuckets
    .filter((bucket) => bucket.isNonReferenceUnit)
    .map((bucket) => ({
      id: `virtual:transfer-clearing:account:${bucket.unitKey}`,
      unit: bucket.unit,
      currency: bucket.currency,
      cryptocurrency: bucket.cryptocurrency,
      symbol: bucket.symbol,
      tradeCurrency: bucket.tradeCurrency,
    }));

  const groupById = new Map(
    baseData.allAccountGroups.map((group) => [group.id, group]),
  );
  for (const virtualGroup of transferClearingVirtualGroups) {
    groupById.set(virtualGroup.id, virtualGroup);
  }

  const assetLiabilityAccounts = [
    ...baseData.baseAssetLiabilityAccounts,
    ...transferClearingVirtualAccounts,
  ];
  for (const virtualAccount of transferClearingVirtualAccounts) {
    assetLiabilityAccountNameById.set(virtualAccount.id, virtualAccount.name);
  }
  for (const [
    holdingAccountId,
    unitLabel,
  ] of transferClearingUnitLabelByHoldingAccountId) {
    if (assetLiabilityAccountNameById.has(holdingAccountId)) {
      continue;
    }
    assetLiabilityAccountNameById.set(holdingAccountId, unitLabel);
  }

  // Intentionally keep posted real-account balances: virtual transfer-clearing
  // accounts represent the missing counterpart leg with opposite sign.
  for (const [accountId, rawBalance] of rawBalanceByVirtualAccountId) {
    endOfPeriodRawBalanceByAccountId.set(accountId, rawBalance);
  }

  const allAccountGroups = [
    ...baseData.allAccountGroups,
    ...transferClearingVirtualGroups,
  ];
  return {
    assetLiabilityAccountNameById,
    endOfPeriodRawBalanceByAccountId,
    transferClearingHoldingAccounts,
    groupById,
    assetLiabilityAccounts,
    allAccountGroups,
  };
}

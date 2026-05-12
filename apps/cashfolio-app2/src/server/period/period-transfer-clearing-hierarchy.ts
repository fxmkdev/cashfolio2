import { AccountType } from "../../.prisma-client/enums";
import { isNearZero } from "./period-overview-holdings-common";
import {
  TRANSFER_CLEARING_CRYPTOCURRENCY_GROUP_ID,
  TRANSFER_CLEARING_CURRENCY_GROUP_ID,
  TRANSFER_CLEARING_ROOT_GROUP_ID,
  TRANSFER_CLEARING_SECURITY_GROUP_ID,
  type TransferClearingUnitBucket,
  type TransferClearingUnitType,
  type TransferClearingVirtualAccount,
  type TransferClearingVirtualGroup,
} from "./period-transfer-clearing-types";

function getTransferClearingUnitTypeGroupId(
  unitType: TransferClearingUnitType,
): string {
  if (unitType === "currency") {
    return TRANSFER_CLEARING_CURRENCY_GROUP_ID;
  }
  if (unitType === "security") {
    return TRANSFER_CLEARING_SECURITY_GROUP_ID;
  }
  return TRANSFER_CLEARING_CRYPTOCURRENCY_GROUP_ID;
}

function getTransferClearingUnitTypeLabel(unitType: TransferClearingUnitType) {
  if (unitType === "currency") {
    return "Currency";
  }
  if (unitType === "security") {
    return "Security";
  }
  return "Cryptocurrency";
}

export function buildTransferClearingVirtualHierarchy(args: {
  unitBuckets: TransferClearingUnitBucket[];
}) {
  const nonZeroBuckets = args.unitBuckets.filter(
    (bucket) => !isNearZero(bucket.rawBalance),
  );
  if (nonZeroBuckets.length === 0) {
    return {
      virtualGroups: [] as TransferClearingVirtualGroup[],
      virtualAccounts: [] as TransferClearingVirtualAccount[],
      rawBalanceByVirtualAccountId: new Map<string, number>(),
    };
  }

  const rootGroup: TransferClearingVirtualGroup = {
    id: TRANSFER_CLEARING_ROOT_GROUP_ID,
    name: "Transfer Clearing",
    parentGroupId: null,
  };
  const virtualGroups: TransferClearingVirtualGroup[] = [rootGroup];

  const presentUnitTypes = new Set(
    nonZeroBuckets.map((bucket) => bucket.unitType),
  );
  const orderedUnitTypes: TransferClearingUnitType[] = [
    "currency",
    "security",
    "cryptocurrency",
  ];
  for (const unitType of orderedUnitTypes) {
    if (!presentUnitTypes.has(unitType)) {
      continue;
    }
    virtualGroups.push({
      id: getTransferClearingUnitTypeGroupId(unitType),
      name: getTransferClearingUnitTypeLabel(unitType),
      parentGroupId: TRANSFER_CLEARING_ROOT_GROUP_ID,
    });
  }

  const virtualAccounts: TransferClearingVirtualAccount[] = [];
  const rawBalanceByVirtualAccountId = new Map<string, number>();

  for (const bucket of nonZeroBuckets) {
    const clearingRawBalance = -bucket.rawBalance;
    const accountId = `virtual:transfer-clearing:account:${bucket.unitKey}`;

    virtualAccounts.push({
      id: accountId,
      name: bucket.unitLabel,
      groupId: getTransferClearingUnitTypeGroupId(bucket.unitType),
      type: clearingRawBalance > 0 ? AccountType.ASSET : AccountType.LIABILITY,
      unit: bucket.unit,
      currency: bucket.currency,
      cryptocurrency: bucket.cryptocurrency,
      symbol: bucket.symbol,
      tradeCurrency: bucket.tradeCurrency,
    });
    rawBalanceByVirtualAccountId.set(accountId, clearingRawBalance);
  }

  return {
    virtualGroups,
    virtualAccounts,
    rawBalanceByVirtualAccountId,
  };
}

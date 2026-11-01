import type { ClassificationNode } from "@/shared/asset-class";
import { Unit } from "@/.prisma-client/enums";
import { getAssetClassLabel } from "@/shared/asset-class";
import { getAccountTrackingMethodLabel } from "@/shared/account-tracking-method";
import {
  isReferenceCurrencyTotalFooterRow,
  type AccountsGridRow,
} from "./-page-types";
export function getAccountListAssetClassValue(
  data: AccountsGridRow | undefined,
  assetClasses?: readonly ClassificationNode[],
): string | undefined {
  if (!data || isReferenceCurrencyTotalFooterRow(data)) {
    return undefined;
  }
  if (data.nodeType === "accountGroup") {
    if (data.groupAssetClass === undefined) return undefined;
    return data.groupAssetClass === "Mixed"
      ? "Mixed"
      : getAssetClassLabel(data.groupAssetClass, assetClasses);
  }
  return getAssetClassLabel(data.assetClassId, assetClasses);
}

export function getAccountListPathValue(
  data: AccountsGridRow | undefined,
): string | undefined {
  if (
    !data ||
    isReferenceCurrencyTotalFooterRow(data) ||
    data.nodeType !== "account"
  )
    return undefined;
  return data.accountGroupPath?.length
    ? data.accountGroupPath.join(" / ")
    : undefined;
}

export function getAccountListTrackingMethodValue(
  data: AccountsGridRow | undefined,
): string | undefined {
  if (!data || isReferenceCurrencyTotalFooterRow(data)) return undefined;
  if (data.nodeType === "accountGroup") {
    if (data.groupTrackingMethod === undefined) return undefined;
    return data.groupTrackingMethod === "Mixed"
      ? "Mixed"
      : getAccountTrackingMethodLabel(data.groupTrackingMethod);
  }
  return getAccountTrackingMethodLabel(data.trackingMethod);
}

export function getAccountListUnitIdentifierDisplayValue(args: {
  data: AccountsGridRow | undefined;
  referenceCurrency: string;
}): string | null | undefined {
  const { data, referenceCurrency } = args;

  if (
    !data ||
    isReferenceCurrencyTotalFooterRow(data) ||
    data.nodeType !== "account"
  ) {
    return undefined;
  }
  if (!data.unit) return undefined;
  switch (data.unit) {
    case Unit.CURRENCY:
      return data.currency === referenceCurrency ? undefined : data.currency;
    case Unit.SECURITY:
      return data.symbol;
    case Unit.CRYPTOCURRENCY:
      return data.cryptocurrency;
  }
}

export function getAccountListBalanceValue(args: {
  data: AccountsGridRow | undefined;
  referenceCurrency: string;
}): number | null {
  const { data, referenceCurrency } = args;

  if (
    !data ||
    isReferenceCurrencyTotalFooterRow(data) ||
    data.nodeType !== "account" ||
    (data.unit === Unit.CURRENCY && data.currency === referenceCurrency)
  ) {
    return null;
  }
  return data.balance;
}

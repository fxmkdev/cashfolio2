import type { GroupBalanceAggregation } from "./-accounts-page-data";
import {
  isReferenceCurrencyTotalFooterRow,
  type AccountsGridRow,
} from "./-accounts-page-types";

export const REFERENCE_BALANCES_LOADING_DELAY_MS = 100;

export function shouldShowReferenceBalanceLoadingIndicator(args: {
  data: AccountsGridRow | undefined;
  isReferenceBalancesLoading: boolean;
  balanceInReferenceCurrencyByGroupId: Map<string, GroupBalanceAggregation>;
}): boolean {
  const {
    data,
    isReferenceBalancesLoading,
    balanceInReferenceCurrencyByGroupId,
  } = args;

  if (!isReferenceBalancesLoading || !data) {
    return false;
  }

  if (isReferenceCurrencyTotalFooterRow(data)) {
    return data.balanceInReferenceCurrency == null;
  }

  if (data.nodeType === "account") {
    return data.balanceInReferenceCurrency == null;
  }

  const groupAggregation = balanceInReferenceCurrencyByGroupId.get(data.id);
  if (!groupAggregation) {
    return false;
  }

  return (
    groupAggregation.hasAccountDescendants &&
    groupAggregation.hasMissingReferenceBalance
  );
}

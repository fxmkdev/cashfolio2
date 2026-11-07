import { Unit } from "@/.prisma-client/enums";
import type { GroupBalanceAggregation } from "../grid/reference-balance-aggregation";
import {
  isReferenceCurrencyTotalFooterRow,
  type AccountsGridRow,
  type TreeRow,
} from "../grid/rows";

export const REFERENCE_BALANCES_LOADING_DELAY_MS = 100;

export function getImmediateReferenceBalance(args: {
  data: TreeRow | AccountsGridRow;
  referenceCurrency: string;
}): number | undefined {
  const { data, referenceCurrency } = args;

  if (isReferenceCurrencyTotalFooterRow(data) || data.nodeType !== "account") {
    return undefined;
  }

  if (
    data.unit !== Unit.CURRENCY ||
    !data.currency ||
    data.currency !== referenceCurrency
  ) {
    return undefined;
  }

  return data.balance ?? undefined;
}

export function shouldShowReferenceBalanceLoadingIndicator(args: {
  data: TreeRow | AccountsGridRow | undefined;
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

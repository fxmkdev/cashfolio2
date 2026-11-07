import { useMemo } from "react";
import type { AccountsMode, TabValue } from "@/shared/account-tabs";
import type { TreeRow } from "../grid/rows";
import {
  getImmediateReferenceRows,
  getReferenceRowsStateKey,
  applyAccountReferenceBalances,
} from "./reference-balance-rows";
import { useReferenceBalanceRequest } from "./use-reference-balance-request";
import { useReferenceBalanceLoading } from "./use-reference-balance-loading";
type ReferenceBalanceOptions = {
  accountBookId: string;
  tab: TabValue;
  mode: AccountsMode;
  referenceCurrency: string;
  rows: TreeRow[];
};

export function useAccountsReferenceBalanceRows(args: ReferenceBalanceOptions) {
  const isEquityTab = args.tab.startsWith("EQUITY-");
  const immediateRows = useMemo(
    () => getImmediateReferenceRows(args.rows, args.referenceCurrency),
    [args.referenceCurrency, args.rows],
  );
  const loaderRowsStateKey = useMemo(
    () => getReferenceRowsStateKey(immediateRows),
    [immediateRows],
  );
  const { balances, loading } = useReferenceBalanceRequest({
    ...args,
    loaderRowsStateKey,
    isEquityTab,
  });
  const rowsWithAccountReferenceBalances = useMemo(
    () => applyAccountReferenceBalances(immediateRows, balances),
    [immediateRows, balances],
  );
  const shouldShowReferenceBalancesLoading =
    useReferenceBalanceLoading(loading);
  return {
    isEquityTab,
    rowsWithAccountReferenceBalances,
    shouldShowReferenceBalancesLoading,
  };
}

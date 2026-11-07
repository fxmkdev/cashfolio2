import { useEffect, useState } from "react";
import { getAccountReferenceBalances } from "@/server/accounts";
import {
  getTabDefinition,
  type AccountsMode,
  type TabValue,
} from "@/shared/accounts/account-tabs";
type RequestScope = {
  accountBookId: string;
  tab: TabValue;
  mode: AccountsMode;
  loaderRowsStateKey: string;
  isEquityTab: boolean;
};

export function startAccountReferenceBalanceRequest(
  accountBookId: string,
  tab: TabValue,
  onRows: (rows: Map<string, number | null>) => void,
  onSettled: () => void,
) {
  const tabDefinition = getTabDefinition(tab);
  let active = true;
  void getAccountReferenceBalances({
    data: {
      accountBookId,
      accountState: "all",
      type: tabDefinition.type,
      ...("equityAccountSubtype" in tabDefinition
        ? { equityAccountSubtype: tabDefinition.equityAccountSubtype }
        : undefined),
    },
  })
    .then((data) => {
      if (active)
        onRows(
          new Map(
            data.rows.map((row) => [row.id, row.balanceInReferenceCurrency]),
          ),
        );
    })
    .catch((error) => {
      console.error(
        "Unable to load reference-currency balances for accounts tab",
        error,
      );
    })
    .finally(() => {
      if (active) onSettled();
    });
  return () => {
    active = false;
  };
}

export function useReferenceBalanceRequest({
  accountBookId,
  mode,
  tab,
  loaderRowsStateKey,
  isEquityTab,
}: RequestScope) {
  const [balances, setBalances] = useState(
    () => new Map<string, number | null>(),
  );
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setBalances(new Map());
  }, [accountBookId, mode, tab, loaderRowsStateKey]);
  useEffect(() => {
    if (isEquityTab) {
      setLoading(false);
      return;
    }
    setLoading(true);
    return startAccountReferenceBalanceRequest(
      accountBookId,
      tab,
      setBalances,
      () => setLoading(false),
    );
  }, [accountBookId, mode, tab, isEquityTab, loaderRowsStateKey]);
  return { balances, loading };
}

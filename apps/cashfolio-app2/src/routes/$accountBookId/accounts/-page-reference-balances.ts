import { useEffect, useMemo, useState } from "react";
import { getAccountReferenceBalances } from "../../../server/accounts";
import {
  type AccountsMode,
  getTabDefinition,
  type TabValue,
  type TreeRow,
} from "./-page-types";
import {
  getImmediateReferenceBalance,
  REFERENCE_BALANCES_LOADING_DELAY_MS,
} from "./-reference-balance-loading";

export function useAccountsReferenceBalanceRows(args: {
  accountBookId: string;
  tab: TabValue;
  mode: AccountsMode;
  referenceCurrency: string;
  rows: TreeRow[];
}) {
  const isEquityTab = args.tab.startsWith("EQUITY-");
  const [referenceBalanceByRowId, setReferenceBalanceByRowId] = useState(
    () => new Map<string, number | null>(),
  );
  const [isReferenceBalancesLoading, setIsReferenceBalancesLoading] =
    useState(false);
  const [showReferenceBalancesLoading, setShowReferenceBalancesLoading] =
    useState(false);

  const rowsWithImmediateReferenceBalances = useMemo(
    () =>
      args.rows.map((row) => {
        const immediateReferenceBalance = getImmediateReferenceBalance({
          data: row,
          referenceCurrency: args.referenceCurrency,
        });
        if (
          immediateReferenceBalance == null ||
          row.balanceInReferenceCurrency === immediateReferenceBalance
        ) {
          return row;
        }
        return {
          ...row,
          balanceInReferenceCurrency: immediateReferenceBalance,
        };
      }),
    [args.referenceCurrency, args.rows],
  );

  const loaderRowsStateKey = useMemo(
    () =>
      JSON.stringify(
        rowsWithImmediateReferenceBalances.map((row) => [
          row.id,
          row.nodeType,
          row.name,
          row.parentId ?? "",
          row.sortOrder ?? "",
          row.balance ?? "",
          row.unit ?? "",
          row.currency ?? "",
          row.tradeCurrency ?? "",
          row.cryptocurrency ?? "",
          row.symbol ?? "",
          row.balanceInReferenceCurrency ?? "",
        ]),
      ),
    [rowsWithImmediateReferenceBalances],
  );

  const rowsWithAccountReferenceBalances = useMemo(
    () =>
      rowsWithImmediateReferenceBalances.map((row) => {
        if (!referenceBalanceByRowId.has(row.id)) {
          return row;
        }
        const referenceBalance = referenceBalanceByRowId.get(row.id) ?? null;
        if (referenceBalance === row.balanceInReferenceCurrency) {
          return row;
        }
        return {
          ...row,
          balanceInReferenceCurrency: referenceBalance,
        };
      }),
    [rowsWithImmediateReferenceBalances, referenceBalanceByRowId],
  );

  useEffect(() => {
    setReferenceBalanceByRowId(new Map());
  }, [args.accountBookId, args.mode, args.tab, loaderRowsStateKey]);

  useEffect(() => {
    if (isEquityTab) {
      setIsReferenceBalancesLoading(false);
      return;
    }

    const tabDefinition = getTabDefinition(args.tab);
    let active = true;
    setIsReferenceBalancesLoading(true);

    void getAccountReferenceBalances({
      data: {
        accountBookId: args.accountBookId,
        accountState: args.mode === "archived" ? "inactive" : "active",
        type: tabDefinition.type,
        ...("equityAccountSubtype" in tabDefinition
          ? { equityAccountSubtype: tabDefinition.equityAccountSubtype }
          : undefined),
      },
    })
      .then((referenceBalanceData) => {
        if (!active) return;

        setReferenceBalanceByRowId(
          new Map(
            referenceBalanceData.rows.map((row) => [
              row.id,
              row.balanceInReferenceCurrency,
            ]),
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
        if (!active) return;
        setIsReferenceBalancesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    args.accountBookId,
    args.mode,
    args.tab,
    isEquityTab,
    loaderRowsStateKey,
  ]);

  useEffect(() => {
    if (!isReferenceBalancesLoading) {
      setShowReferenceBalancesLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowReferenceBalancesLoading(true);
    }, REFERENCE_BALANCES_LOADING_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isReferenceBalancesLoading]);

  return {
    isEquityTab,
    rowsWithAccountReferenceBalances,
    shouldShowReferenceBalancesLoading:
      isReferenceBalancesLoading && showReferenceBalancesLoading,
  };
}

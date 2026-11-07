import { getImmediateReferenceBalance } from "./reference-balance-loading";
import type { TreeRow } from "./page-types";

export function getImmediateReferenceRows(
  rows: TreeRow[],
  referenceCurrency: string,
) {
  return rows.map((row) => {
    const immediateReferenceBalance = getImmediateReferenceBalance({
      data: row,
      referenceCurrency,
    });
    if (
      immediateReferenceBalance == null ||
      row.balanceInReferenceCurrency === immediateReferenceBalance
    )
      return row;
    return { ...row, balanceInReferenceCurrency: immediateReferenceBalance };
  });
}

export function getReferenceRowsStateKey(rows: TreeRow[]) {
  return JSON.stringify(
    rows.map((row) => [
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
  );
}

export function applyAccountReferenceBalances(
  rows: TreeRow[],
  balances: Map<string, number | null>,
) {
  return rows.map((row) => {
    if (!balances.has(row.id)) return row;
    const referenceBalance = balances.get(row.id) ?? null;
    return referenceBalance === row.balanceInReferenceCurrency
      ? row
      : { ...row, balanceInReferenceCurrency: referenceBalance };
  });
}

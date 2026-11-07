import { toAccountGridTreeRow } from "./rows";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { buildUnifiedAccountTreeRows } from "@/shared/accounts/archived-account-tree-rows";
import type { TreeRow } from "./rows";
import { calculateBalanceInReferenceCurrencyByGroupId } from "./reference-balance-aggregation";
import {
  useReferenceCurrencyBalanceTotal,
  useRowsByParentKey,
} from "./group-summaries";

function row(id: string, overrides: Partial<TreeRow> = {}): TreeRow {
  return {
    id,
    name: id,
    nodeType: "account",
    type: "BALANCE",
    equityAccountSubtype: null,
    unit: "CURRENCY",
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    balance: 10,
    balanceInReferenceCurrency: 10,
    openingBalance: null,
    parentId: "group",
    isActive: true,
    groupId: "group",
    sortOrder: null,
    deletable: false,
    deleteDisabledReason: undefined,
    archivable: false,
    archiveDisabledReason: undefined,
    unarchivable: false,
    unarchiveDisabledReason: undefined,
    ...overrides,
  };
}

it("includes archived leaves once in balances", () => {
  const source = [
    row("group", {
      nodeType: "accountGroup",
      parentId: undefined,
      balanceInReferenceCurrency: null,
    }),
    row("active"),
    row("archived", { isActive: false }),
    row("archived-other", { isActive: false }),
    row("root-archived", {
      parentId: undefined,
      groupId: undefined,
      isActive: false,
    }),
  ];
  const rows = buildUnifiedAccountTreeRows(source);
  function Harness() {
    const byParent = useRowsByParentKey(rows.map(toAccountGridTreeRow));
    const balances = calculateBalanceInReferenceCurrencyByGroupId(
      byParent,
      rows,
    );
    expect(balances.get("group")).toEqual({
      sum: 30,
      hasAccountDescendants: true,
      hasMissingReferenceBalance: false,
    });
    expect(balances.get("__archived__:group:group")?.sum).toBe(20);
    expect(useReferenceCurrencyBalanceTotal(rows)).toBe(40);
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
});

it("withholds group and footer balances when a collapsed archived leaf is incomplete", () => {
  const rows = buildUnifiedAccountTreeRows([
    row("group", { nodeType: "accountGroup", parentId: undefined }),
    row("active"),
    row("archived", { isActive: false, balanceInReferenceCurrency: null }),
  ]);
  function Harness() {
    const balances = calculateBalanceInReferenceCurrencyByGroupId(
      useRowsByParentKey(rows),
      rows,
    );
    expect(balances.get("group")?.hasMissingReferenceBalance).toBe(true);
    expect(
      balances.get("__archived__:group:group")?.hasMissingReferenceBalance,
    ).toBe(true);
    expect(useReferenceCurrencyBalanceTotal(rows)).toBeNull();
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
});

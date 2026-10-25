import { describe, expect, it } from "vitest";
import { AccountType } from "@/.prisma-client/enums";
import { buildUnifiedAccountTreeRows } from "@/shared/archived-account-tree-rows";
import type { TreeRow } from "./-page-types";
import {
  createAccountBulkActionTarget,
  isBulkAccountRow,
  isBulkAccount,
  getBulkAccountGroupTargets,
  getBulkAccountSelectionSummary,
  reconcileBulkAccountSelection,
} from "./-bulk-account-targets";

function row(
  id: string,
  nodeType: TreeRow["nodeType"],
  parentId?: string,
  isActive = true,
): TreeRow {
  return {
    id,
    nodeType,
    parentId,
    groupId: nodeType === "account" ? parentId : id,
    isActive,
    type: AccountType.BALANCE,
    name: id,
    equityAccountSubtype: null,
    unit: null,
    currency: null,
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    balance: null,
    balanceInReferenceCurrency: null,
    openingBalance: null,
    sortOrder: null,
    deletable: false,
    deleteDisabledReason: undefined,
    archivable: false,
    archiveDisabledReason: undefined,
    unarchivable: false,
    unarchiveDisabledReason: undefined,
  };
}

describe("asset class assignment targets", () => {
  const raw = [
    row("group", "accountGroup"),
    row("nested", "accountGroup", "group"),
    row("active", "account", "group"),
    row("archived", "account", "nested", false),
    row("old-group", "accountGroup", "group", false),
    row("old-child", "account", "old-group", false),
    row("outside", "account"),
    row("empty", "accountGroup"),
  ];

  it("shows checkboxes on balance accounts and real groups, excluding Archived wrappers", () => {
    const projected = buildUnifiedAccountTreeRows(raw);
    expect(projected.some((row) => row.isVirtualArchivedGroup)).toBe(true);
    expect(projected.filter(isBulkAccountRow).map((row) => row.id)).toEqual(
      raw.map((row) => row.id),
    );
    for (const nodeType of ["account", "accountGroup"] as const) {
      expect(
        isBulkAccountRow({
          ...raw[0],
          nodeType,
          type: AccountType.EQUITY,
        }),
      ).toBe(false);
    }
    expect(isBulkAccountRow(undefined)).toBe(false);
    expect(
      isBulkAccountRow({
        id: "__reference_currency_total_footer__",
        rowType: "referenceCurrencyTotalFooter",
        name: "Total",
        balanceInReferenceCurrency: 0,
      }),
    ).toBe(false);
  });

  it("selects balance-account leaves only, including archived accounts", () => {
    const projected = buildUnifiedAccountTreeRows(raw);
    expect(projected.filter(isBulkAccount).map((r) => r.id)).toEqual([
      "active",
      "archived",
      "old-child",
      "outside",
    ]);
    expect(isBulkAccount({ ...raw[2], type: AccountType.EQUITY })).toBe(false);
    expect(
      isBulkAccount({
        id: "__reference_currency_total_footer__",
        rowType: "referenceCurrencyTotalFooter",
        name: "Total",
        balanceInReferenceCurrency: 0,
      }),
    ).toBe(false);
    expect(isBulkAccount(undefined)).toBe(false);
  });

  it("freezes IDs and archived count when opening a dialog", () => {
    const accounts = [raw[2], raw[3], raw[5]];
    const target = createAccountBulkActionTarget(accounts);
    accounts.push(row("new", "account", "group"));
    expect(target).toEqual({
      accountIds: ["active", "archived", "old-child"],
      archivedCount: 2,
    });
  });

  it("resolves nested and archived descendants through display wrappers", () => {
    const targets = getBulkAccountGroupTargets(
      buildUnifiedAccountTreeRows(raw),
    );
    expect(targets.get("group")).toEqual(["active", "archived", "old-child"]);
    expect(targets.get("nested")).toEqual(["archived"]);
    expect(targets.get("old-group")).toEqual(["old-child"]);
    expect(targets.has("empty")).toBe(false);
    expect(
      [...targets.keys()].some((id) => id.startsWith("__archived__:")),
    ).toBe(false);
  });

  it("counts explicit group/account selections and deduplicates their targets", () => {
    const selected = reconcileBulkAccountSelection(
      raw,
      ["group", "nested", "active", "outside"],
      new Map(),
    );
    const summary = getBulkAccountSelectionSummary(raw, selected);
    expect(summary.selectedAccountCount).toBe(2);
    expect(summary.selectedGroupCount).toBe(2);
    expect(summary.canMove).toBe(false);
    expect(createAccountBulkActionTarget(summary.accounts)).toEqual({
      accountIds: ["active", "archived", "old-child", "outside"],
      archivedCount: 2,
    });
  });

  it("allows moving every account in a group without selecting the group", () => {
    const selected = reconcileBulkAccountSelection(
      raw,
      ["active", "archived", "old-child"],
      new Map(),
    );
    expect(getBulkAccountSelectionSummary(raw, selected)).toMatchObject({
      selectedAccountCount: 3,
      selectedGroupCount: 0,
      canMove: true,
    });
    const mixed = reconcileBulkAccountSelection(
      raw,
      [...selected.keys(), "group"],
      selected,
    );
    expect(getBulkAccountSelectionSummary(raw, mixed).canMove).toBe(false);
    const accountsOnly = reconcileBulkAccountSelection(
      raw,
      [...selected.keys()],
      mixed,
    );
    expect(getBulkAccountSelectionSummary(raw, accountsOnly).canMove).toBe(
      true,
    );
    expect(getBulkAccountSelectionSummary(raw, new Map()).canMove).toBe(false);
  });

  it("captures only filtered descendants and never adds targets when a filter clears", () => {
    const filtered = raw.filter(
      (row) => row.id !== "archived" && row.id !== "old-child",
    );
    const selected = reconcileBulkAccountSelection(
      filtered,
      ["group"],
      new Map(),
    );
    expect(selected.get("group")).toEqual(["active"]);
    expect(
      reconcileBulkAccountSelection(raw, ["group"], selected).get("group"),
    ).toEqual(["active"]);
  });

  it("removes filtered targets and requires reselection to restore them", () => {
    const selected = reconcileBulkAccountSelection(
      raw,
      ["group", "outside"],
      new Map(),
    );
    const narrowed = reconcileBulkAccountSelection(
      raw.filter((row) => row.id !== "archived" && row.id !== "outside"),
      [...selected.keys()],
      selected,
    );
    expect(narrowed.get("group")).toEqual(["active", "old-child"]);
    expect(narrowed.has("outside")).toBe(false);
    expect(
      reconcileBulkAccountSelection(raw, [...narrowed.keys()], narrowed).get(
        "group",
      ),
    ).toEqual(["active", "old-child"]);
    expect(
      reconcileBulkAccountSelection(raw, ["group"], new Map()).get("group"),
    ).toEqual(["active", "archived", "old-child"]);
  });

  it("drops empty, synthetic, unavailable, and non-balance selections", () => {
    const projected = buildUnifiedAccountTreeRows(raw);
    const selected = reconcileBulkAccountSelection(
      projected,
      ["group"],
      new Map(),
    );
    const filtered = projected.filter((row) => !isBulkAccount(row));
    expect(
      reconcileBulkAccountSelection(filtered, ["group"], selected).size,
    ).toBe(0);
    expect(
      reconcileBulkAccountSelection(
        projected,
        ["empty", "missing", "__archived__:root"],
        new Map(),
      ).size,
    ).toBe(0);
    expect(
      reconcileBulkAccountSelection(
        [{ ...raw[0], type: AccountType.EQUITY }],
        ["group"],
        new Map(),
      ).size,
    ).toBe(0);
  });

  it("removes deleted or moved accounts on refresh without adding new descendants", () => {
    const selected = reconcileBulkAccountSelection(raw, ["group"], new Map());
    const refreshed = [
      ...raw
        .filter((row) => row.id !== "archived")
        .map((row) =>
          row.id === "active" ? { ...row, parentId: undefined } : row,
        ),
      row("new", "account", "group"),
    ];
    const next = reconcileBulkAccountSelection(refreshed, ["group"], selected);
    expect(next.get("group")).toEqual(["old-child"]);
    expect(selected.get("group")).toEqual(["active", "archived", "old-child"]);
    expect(
      reconcileBulkAccountSelection(
        raw.filter((row) => row.id !== "group"),
        ["group"],
        selected,
      ).size,
    ).toBe(0);
  });
});

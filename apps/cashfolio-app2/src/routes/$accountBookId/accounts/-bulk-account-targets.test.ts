import { describe, expect, it } from "vitest";
import { AccountType } from "@/.prisma-client/enums";
import { buildUnifiedAccountTreeRows } from "@/shared/archived-account-tree-rows";
import type { TreeRow } from "./-page-types";
import {
  createAccountBulkActionTarget,
  isBulkAccountRow,
  isBulkAccount,
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

  it("shows checkboxes on balance accounts, real groups, and Archived wrappers", () => {
    const projected = buildUnifiedAccountTreeRows(raw);
    expect(projected.some((row) => row.isVirtualArchivedGroup)).toBe(true);
    expect(projected.every(isBulkAccountRow)).toBe(true);
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
});

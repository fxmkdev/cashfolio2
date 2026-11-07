import { describe, expect, expectTypeOf, it } from "vitest";
import { account } from "./asset-class-test-fixtures";
import { buildUnifiedAccountTreeRows } from "@/shared/accounts/archived-account-tree-rows";
import {
  isPersistedTreeRow,
  isPersistedAccountRow,
  isPersistedGroupRow,
  toAccountGridTreeRow,
  toRowTarget,
  type PersistedTreeRow,
  type DisplayHeadingRow,
} from "./rows";
import {
  createAccountBulkActionTarget,
  isBulkAccount,
  isBulkAccountRow,
} from "../assignments/targets";

describe("account grid row identities", () => {
  it("adapts real accounts/groups without changing the source wire objects or IDs", () => {
    const raw = account("account", { isActive: false });
    const row = toAccountGridTreeRow(raw);
    expect(row).toMatchObject({
      id: raw.id,
      rowType: "account",
      isActive: false,
    });
    expect(raw).not.toHaveProperty("rowType");
    expect(isPersistedAccountRow(row)).toBe(true);
    expect(isPersistedGroupRow(row)).toBe(false);
    if (!isPersistedTreeRow(row)) throw new Error("Expected account");
    expect(toRowTarget(row)).toEqual({
      id: raw.id,
      nodeType: "account",
      name: raw.name,
    });
    const group = toAccountGridTreeRow(
      account("group", { nodeType: "accountGroup" }),
    );
    expect(isPersistedGroupRow(group)).toBe(true);
    expect(isPersistedAccountRow(group)).toBe(false);
  });

  it.each(["assetClass", "unclassified", "unit", "archived"] as const)(
    "keeps %s headings out of persisted action and bulk targets",
    (presentationKind) => {
      const row = toAccountGridTreeRow(
        account("heading", { nodeType: "accountGroup", presentationKind }),
      );
      expect(row.rowType).toBe("heading");
      expect(isPersistedTreeRow(row)).toBe(false);
      expect(isBulkAccount(row)).toBe(false);
      expect(isBulkAccountRow(row)).toBe(true);
      expect(
        isPersistedTreeRow({
          ...row,
          rowType: "accountGroup",
        } as unknown as PersistedTreeRow),
      ).toBe(false);
    },
  );

  it("preserves archived wrappers and leaves while freezing only persisted account IDs", () => {
    const projected = buildUnifiedAccountTreeRows([
      account("group", {
        nodeType: "accountGroup",
        parentId: undefined,
        groupId: undefined,
      }),
      account("active", { parentId: "group", groupId: "group" }),
      account("archived", {
        parentId: "group",
        groupId: "group",
        isActive: false,
      }),
    ]);
    const rows = projected.map(toAccountGridTreeRow);
    expect(rows.map((row) => row.id)).toEqual(projected.map((row) => row.id));
    expect(rows.find((row) => row.isVirtualArchivedGroup)?.rowType).toBe(
      "heading",
    );
    expect(createAccountBulkActionTarget(rows.filter(isBulkAccount))).toEqual({
      accountIds: ["active", "archived"],
      archivedCount: 1,
    });
  });

  it("requires persisted variants at mutation-target construction", () => {
    expectTypeOf(toRowTarget).parameter(0).toEqualTypeOf<PersistedTreeRow>();
    expectTypeOf<DisplayHeadingRow>().not.toExtend<PersistedTreeRow>();
    expect(isPersistedTreeRow(undefined)).toBe(false);
    expect(
      isPersistedTreeRow({
        id: "__reference_currency_total_footer__",
        rowType: "referenceCurrencyTotalFooter",
        name: "Total",
        balanceInReferenceCurrency: 0,
      }),
    ).toBe(false);
  });
});

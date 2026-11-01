import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountType } from "@/.prisma-client/enums";
import type { TreeRow } from "./-page-types";
import { useAccountTreeColumnDefs } from "./-page-columns";
import { createAccountRow, createGroupRow } from "./-column-test-fixtures";
describe("account tree Delete explanations", () => {
  it.each([true, false])(
    "protects synthetic headings and disables reorder in Asset Class view (active=%s)",
    (isActive) => {
      let render!: (params: { data: TreeRow }) => ReactElement<{
        reorderEnabled: boolean;
        reorderLabel: string;
        onEdit: () => void;
      }> | null;
      const onEdit = vi.fn();
      function Harness() {
        const columns = useAccountTreeColumnDefs({
          grouping: "assetClass",
          isEquityTab: false,
          rowsByParentKey: new Map(),
          referenceCurrency: "CHF",
          isReferenceBalancesLoading: false,
          balanceInReferenceCurrencyByGroupId: new Map(),
          onEditRow: onEdit,
          onUnarchiveRow: async () => {},
          onArchiveRow: () => {},
          onDeleteRow: () => {},
          onReorderRow: () => {},
        });
        const actions = columns.find(
          (column) => "colId" in column && column.colId === "actions",
        );
        if (!actions || !("cellRenderer" in actions))
          throw new Error("Missing actions");
        render = actions.cellRenderer;
        return null;
      }
      renderToStaticMarkup(createElement(Harness));
      for (const presentationKind of [
        "assetClass",
        "unclassified",
        "unit",
        "archived",
      ] as const) {
        expect(
          render({ data: { ...createGroupRow(), presentationKind, isActive } }),
        ).toBeNull();
      }
      const account = createAccountRow({ isActive });
      const action = render({ data: account })!;
      expect(action.props.reorderEnabled).toBe(false);
      expect(action.props.reorderLabel).toBe(
        "Switch to Account Structure to reorder siblings",
      );
      action.props.onEdit();
      expect(onEdit).toHaveBeenCalledWith(account);
    },
  );

  for (const isActive of [true, false]) {
    for (const isEquityTab of [true, false]) {
      it.each(["account", "accountGroup"] as const)(
        `uses contextual wording for ${isActive ? "active" : "archived"} ${isEquityTab ? "category" : "account"} %s rows`,
        (nodeType) => {
          const row =
            nodeType === "account" ? createAccountRow() : createGroupRow();
          row.isActive = isActive;
          row.type = isEquityTab ? AccountType.EQUITY : AccountType.BALANCE;
          row.deletable = false;
          row.deleteDisabledReason =
            nodeType === "account"
              ? "Cannot delete account because it has bookings"
              : "Cannot delete group because it contains accounts";
          let action!: ReactElement<{
            deleteLabel: string;
            deletable: boolean;
          }>;
          function Harness() {
            const columns = useAccountTreeColumnDefs({
              isEquityTab,
              rowsByParentKey: new Map(),
              referenceCurrency: "CHF",
              isReferenceBalancesLoading: false,
              balanceInReferenceCurrencyByGroupId: new Map(),
              onEditRow: () => {},
              onUnarchiveRow: async () => {},
              onArchiveRow: () => {},
              onDeleteRow: () => {},
              onReorderRow: () => {},
            });
            const column = columns.find(
              (candidate) =>
                "colId" in candidate && candidate.colId === "actions",
            );
            if (!column || !("cellRenderer" in column))
              throw new Error("Missing actions column");
            action = column.cellRenderer({ data: row });
            return null;
          }
          renderToStaticMarkup(createElement(Harness));
          expect(action.props.deleteLabel).toBe(
            isEquityTab
              ? nodeType === "account"
                ? "Cannot delete category because it has bookings"
                : "Cannot delete category group because it contains categories"
              : row.deleteDisabledReason,
          );
          expect(action.props.deletable).toBe(false);
        },
      );
    }
  }
});

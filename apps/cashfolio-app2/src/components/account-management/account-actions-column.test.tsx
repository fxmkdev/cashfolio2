import { buildAccountFilterContext } from "./account-filter-context";
import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountType } from "@/.prisma-client/enums";
import { toAccountGridTreeRow, type AccountsGridRow } from "./page-types";
import { useAccountTreeColumnDefs } from "./page-columns";
import {
  createAccountRow,
  createGroupRow,
  footerRow,
} from "./column-test-fixtures";
describe("account tree Delete explanations", () => {
  it.each([true, false])(
    "protects synthetic headings and omits reorder in Asset Class view (active=%s)",
    (isActive) => {
      let render!: (params: {
        data: AccountsGridRow | undefined;
      }) => ReactElement<{
        onMove?: () => void;
        onEdit: () => void;
        onAddAccount?: () => void;
        onAddGroup?: () => void;
      }> | null;
      const onEdit = vi.fn();
      const onMove = vi.fn();
      const onAddChild = vi.fn();
      function Harness() {
        const columns = useAccountTreeColumnDefs({
          filterContext: buildAccountFilterContext([], [], []),
          grouping: "assetClass",
          isEquityTab: false,
          rowsByParentKey: new Map(),
          referenceCurrency: "CHF",
          isReferenceBalancesLoading: false,
          balanceInReferenceCurrencyByGroupId: new Map(),
          onEditRow: onEdit,
          onMoveRow: onMove,
          onAddChild,
          onUnarchiveRow: async () => {},
          onArchiveRow: () => {},
          onDeleteRow: () => {},
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
          render({
            data: toAccountGridTreeRow({
              ...createGroupRow(),
              presentationKind,
              isActive,
            }),
          }),
        ).toBeNull();
      }
      expect(
        render({
          data: toAccountGridTreeRow({
            ...createGroupRow(),
            isVirtualArchivedGroup: true,
            isActive,
          }),
        }),
      ).toBeNull();
      expect(render({ data: footerRow })).toBeNull();
      expect(render({ data: undefined })).toBeNull();
      const account = createAccountRow({ isActive });
      const action = render({ data: account })!;
      expect(action.props).not.toHaveProperty("onReorder");
      action.props.onMove!();
      expect(onMove).toHaveBeenCalledWith(account);
      const groupMove = { ...createGroupRow(), isActive };
      render({ data: groupMove })!.props.onMove!();
      expect(onMove).toHaveBeenCalledWith(groupMove);
      action.props.onEdit();
      expect(onEdit).toHaveBeenCalledWith(account);
      expect(action.props.onAddAccount).toBeUndefined();
      expect(action.props.onAddGroup).toBeUndefined();
      if (isActive) {
        const group = createGroupRow();
        const groupAction = render({ data: group })!;
        groupAction.props.onAddAccount!();
        groupAction.props.onAddGroup!();
        expect(onAddChild.mock.calls).toEqual([
          [group, "account"],
          [group, "accountGroup"],
        ]);
      }
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
              filterContext: buildAccountFilterContext([], [], []),
              isEquityTab,
              rowsByParentKey: new Map(),
              referenceCurrency: "CHF",
              isReferenceBalancesLoading: false,
              balanceInReferenceCurrencyByGroupId: new Map(),
              onEditRow: () => {},
              onUnarchiveRow: async () => {},
              onArchiveRow: () => {},
              onDeleteRow: () => {},
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

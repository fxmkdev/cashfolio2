import { getManagementTabs } from "../-page-types";
import type { AccountsPageViewProps } from "../-page-view-types";
import { isVirtualArchivedGroup } from "../-archived-grid-rows";
import { accountGroups, existingNodes } from "./fixtures";
import { getStoryModalProps } from "./use-story-modals";
import type { useAccountsStoryModel } from "./use-story-model";
import type { AccountsStoryOptions } from "./types";

export function getStoryViewProps(
  model: ReturnType<typeof useAccountsStoryModel>,
  options: AccountsStoryOptions,
): AccountsPageViewProps {
  const { routing, modalState, presentation, gainLossState } = model;
  const { tab, mode, showArchived, isEquityTab, navigate } = routing;
  const { rows } = presentation;
  return {
    ...getStoryModalProps(modalState),
    grouping: model.grouping,
    onGroupingChange: model.setGrouping,
    bulkAccountActions:
      options.bulkAssignment && !isEquityTab ? model.assignment : undefined,
    onGridReady: ({ api }) => {
      model.bulkApiRef.current = api;
    },
    gainLoss: {
      data:
        gainLossState === "loading" ||
        (!isEquityTab && gainLossState === "error")
          ? undefined
          : presentation.gainLossData,
      loading: !isEquityTab && gainLossState === "loading",
      error:
        gainLossState === "error"
          ? "Gain/loss could not be loaded. Please try again."
          : undefined,
      retry: () => model.setGainLossState("ready"),
    },
    accountBookId: "storybook-book",
    tab,
    mode,
    showArchived,
    onShowArchivedChange: (value) => {
      void navigate({
        to: "/$accountBookId/settings/categories",
        params: { accountBookId: "storybook-book" },
        search: { tab, showArchived: value },
      });
    },
    managementContext: isEquityTab ? "categories" : "accounts",
    tabs: getManagementTabs(isEquityTab ? "categories" : "accounts"),
    accountGroups: isEquityTab
      ? rows
          .filter((row) => row.nodeType === "accountGroup")
          .map((row) => ({
            value: row.id,
            label: row.name,
            type: row.type,
            equityAccountSubtype: row.equityAccountSubtype,
            parentGroupId: row.parentId ?? null,
            isCashAccount: false,
            treePath: row.parentId ? ["Housing"] : [],
            treeLabel: row.name,
          }))
      : accountGroups,
    existingNodes,
    unitUsage: { currencies: ["CHF", "EUR", "USD"], cryptocurrencies: ["BTC"] },
    rows,
    columnDefs: model.columnDefs,
    pinnedBottomRowData: presentation.pinnedBottomRowData,
    isGroupOpenByDefault: options.rememberExpansion
      ? model.expansion.isGroupOpenByDefault
      : ({ rowNode }) =>
          isEquityTab && isVirtualArchivedGroup(rowNode.data)
            ? false
            : !!options.expandGroups || options.initialMode === "archived",
    onRowGroupOpened: options.rememberExpansion
      ? model.expansion.onRowGroupOpened
      : () => undefined,
    selectedSiblingRows: model.selectedSiblingRows,
    onOpenLedger: (nextAccountId) => {
      if (options.routeSmoke) {
        void navigate({
          to: "/$accountBookId/$accountId",
          params: { accountBookId: "storybook-book", accountId: nextAccountId },
        });
      }
    },
  };
}

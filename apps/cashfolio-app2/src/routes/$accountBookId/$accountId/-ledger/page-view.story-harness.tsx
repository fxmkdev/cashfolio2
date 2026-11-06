import { Box, Text } from "@mantine/core";
import { useNavigate } from "@tanstack/react-router";
import { AccountType, EquityAccountSubtype } from "@/.prisma-client/enums";
import { PeriodFilterAction } from "../../-period-filter-action";
import { useLedgerColumnDefs } from "./page-columns";
import { LedgerPageView } from "./page-view";
import {
  createLedgerStoryAccount,
  getLedgerStoryViewData,
  type LedgerPageStoryOptions,
} from "./page-view.story-fixtures";
import {
  useLedgerStoryAccountDialogs,
  useLedgerStoryCreateDialogs,
  useLedgerStoryEditDialog,
  useLedgerStoryTransactionActions,
} from "./page-view.story-dialogs";
import { useLedgerStoryPeriod } from "./page-view.story-period";

export function LedgerPageStoryHarness(options: LedgerPageStoryOptions) {
  const navigate = useNavigate({ from: "/$accountBookId/$accountId" });
  const account = createLedgerStoryAccount(options);
  const accountDialogs = useLedgerStoryAccountDialogs(account);
  const createDialogs = useLedgerStoryCreateDialogs(options);
  const editDialog = useLedgerStoryEditDialog(options);
  const actions = useLedgerStoryTransactionActions();
  const period = useLedgerStoryPeriod();
  const columnDefs = useLedgerColumnDefs({
    accountBookId: "storybook-book",
    hasPeriodFilter: period.hasPeriodFilter,
    referenceCurrency: null,
    isEquity: account.type === AccountType.EQUITY,
    isOpeningBalances: false,
    isIncome: false,
    isExpense: false,
    onEditClick: editDialog.onEdit,
    onRebookClick: actions.onRebook,
    onCopyClick: createDialogs.onCopy,
    onDeleteClick: actions.onDelete,
  });
  return (
    <Box
      style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}
    >
      <LedgerPageView
        {...getLedgerStoryViewData(account, options)}
        {...accountDialogs.props}
        {...createDialogs.props}
        {...editDialog.props}
        {...actions.props}
        columnDefs={columnDefs}
        returnNavigation={
          options.returnLabel
            ? {
                target: {
                  href: "/storybook-book/report?period=2026-01",
                  label: options.returnLabel,
                },
                onReturn: () =>
                  void navigate({
                    to: "/$accountBookId/report",
                    params: { accountBookId: "storybook-book" },
                    search: { period: "2026-01" },
                  }),
              }
            : undefined
        }
        onManageCategory={
          options.equitySubtype === EquityAccountSubtype.EXPENSE ||
          options.equitySubtype === EquityAccountSubtype.INCOME
            ? () =>
                void navigate({
                  to: "/$accountBookId/settings/categories",
                  params: { accountBookId: "storybook-book" },
                  search: {
                    tab:
                      options.equitySubtype === EquityAccountSubtype.INCOME
                        ? "EQUITY-INCOME"
                        : "EQUITY-EXPENSE",
                    showArchived: !account.isActive,
                  },
                })
            : undefined
        }
        periodFilterControls={
          options.includePeriodFilterControls ? (
            <PeriodFilterAction {...period.controls} />
          ) : undefined
        }
      />
      {options.routeSmoke ? (
        <Text data-testid="router-path">{period.pathname}</Text>
      ) : null}
      {options.routeSmoke ? (
        <Text data-testid="router-search-period">
          {period.routeSearchPeriod ?? "(none)"}
        </Text>
      ) : null}
    </Box>
  );
}

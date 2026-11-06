import { Anchor, Group } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { getAccountEntityLabel } from "@/shared/account-presentation";
import { UnarchiveMutationFeedback } from "@/components/dialogs/unarchive-mutation-feedback";
import {
  BulkTransactionToolbar,
  BulkTransactionDialogs,
} from "@/components/transactions/bulk-transaction-actions";
import { DataGrid } from "@/components/grid/data-grid";
import { PageShell } from "@/components/layout/page-shell";
import { LedgerPageHeader } from "./page-header";
import { LedgerAccountDialogs } from "./account-dialogs";
import { LedgerTransactionCreateDialogs } from "./transaction-create-dialogs";
import { LedgerTransactionEditDialog } from "./transaction-edit-dialog";
import { LedgerTransactionActionDialogs } from "./transaction-action-dialogs";
import type { LedgerPageViewProps } from "./page-view.types";
export type {
  TransactionBookingInput,
  TransactionMutationValues,
  SplitModalInitialValues,
  SimpleTransactionValues,
  EditMode,
  RebookingState,
  LedgerPageViewProps,
} from "./page-view.types";

export function LedgerPageView(props: LedgerPageViewProps) {
  const {
    returnNavigation,
    account,
    bulkActions,
    gainLossSection,
    rows,
    columnDefs,
    onRowDataUpdated,
  } = props;
  const entityLabel = getAccountEntityLabel(account);
  return (
    <PageShell>
      {returnNavigation && (
        <Anchor
          href={returnNavigation.target.href}
          size="sm"
          mb="sm"
          onClick={(event) => {
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            returnNavigation.onReturn();
          }}
        >
          <Group component="span" gap="xs" wrap="nowrap">
            <IconArrowLeft size={16} aria-hidden="true" />
            <span>Back to {returnNavigation.target.label}</span>
          </Group>
        </Anchor>
      )}
      <LedgerPageHeader {...props} />
      <UnarchiveMutationFeedback
        listLabel={
          entityLabel === "Category" ? "category list" : "account list"
        }
        recovery={props.unarchiveRecovery}
        onRefreshConstraints={props.onRefreshConstraints}
      />
      {bulkActions && <BulkTransactionToolbar actions={bulkActions} />}
      {gainLossSection}
      <DataGrid
        {...bulkActions?.gridProps}
        containerStyle={{ flex: 1, minHeight: 0 }}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={{ sortable: false, suppressHeaderMenuButton: true }}
        getRowId={({ data }) => data.id}
        onRowDataUpdated={(event) => {
          bulkActions?.gridProps.onRowDataUpdated?.(event);
          onRowDataUpdated?.(event);
        }}
      />
      {bulkActions && <BulkTransactionDialogs actions={bulkActions} />}
      <LedgerTransactionCreateDialogs {...props} />
      <LedgerTransactionEditDialog {...props} />
      <LedgerAccountDialogs {...props} />
      <LedgerTransactionActionDialogs {...props} />
    </PageShell>
  );
}

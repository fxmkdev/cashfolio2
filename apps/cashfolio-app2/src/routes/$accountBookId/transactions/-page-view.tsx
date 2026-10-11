import { Button, Group, Modal, Title } from "@mantine/core";
import { IconBolt } from "@tabler/icons-react";
import type { AgGridReactProps } from "ag-grid-react";
import { ConfirmDeleteModal } from "@/components/confirm-delete-modal";
import { DataGrid, dataTypeDefinitions } from "@/components/data-grid";
import { columnTypes } from "@/components/column-types";
import {
  EditTransactionModal,
  type AccountOption,
  type BookingValues,
} from "@/components/edit-transaction-modal";
import { getTransactionCreateDialogText } from "@/components/transaction-create-dialog-text";
import {
  RebookBookingModal,
  type RebookTargetOption,
} from "@/components/rebook-booking-modal";
import { PageShell } from "@/components/page-shell";
import { TopPageHeader } from "@/components/top-page-header";
import type { ReactNode } from "react";
import type { Unit } from "@/.prisma-client/enums";
import { useUserLocale } from "@/user-locale-context";
import type { TransactionsBookingRow, TransactionsRow } from "./-page-types";

export type TransactionBookingInput = {
  date: string;
  accountId: string;
  description: string;
  unit: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
  value: number;
};

export type TransactionMutationValues = {
  description: string;
  bookings: TransactionBookingInput[];
};

export type RebookingState = {
  bookingId: string;
  transactionId: string;
  currentAccountId: string;
  bookingValue: number;
  bookingUnit: {
    unit: Unit | null;
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
  };
};

export type TransactionsPageViewProps = {
  accountBookId: string;
  onRefreshConstraints?: () => Promise<void>;
  rows: TransactionsRow[];
  columnDefs: NonNullable<AgGridReactProps<TransactionsRow>["columnDefs"]>;
  detailColumnDefs: NonNullable<
    AgGridReactProps<TransactionsBookingRow>["columnDefs"]
  >;
  accountBookStartDate: Date;
  createModalOpened: boolean;
  editModalOpened: boolean;
  isCreateSubmitting: boolean;
  isEditSubmitting: boolean;
  isRebookSubmitting: boolean;
  createTransactionInitialValues?: {
    description?: string;
    bookings?: Omit<BookingValues, "key">[];
  };
  editingTransactionData?: {
    id: string;
    description?: string;
    bookings?: Omit<BookingValues, "key">[];
  };
  deletingTransaction?: { id: string; description: string };
  rebooking?: RebookingState;
  rebookModalOpened: boolean;
  hasCompleteBookingUnit: boolean;
  accountOptions: AccountOption[];
  editAccountOptions: AccountOption[];
  rebookTargetAccountOptions: RebookTargetOption[];
  periodFilterControls?: ReactNode;
  onRowDataUpdated: AgGridReactProps<TransactionsRow>["onRowDataUpdated"];
  onAddTransactionClick: () => void;
  onCloseCreateModal: () => void;
  onCreateSubmittingChange: (isSubmitting: boolean) => void;
  onSubmitCreateTransaction: (
    values: TransactionMutationValues,
  ) => Promise<void>;
  onCloseEditModal: () => void;
  onEditSubmittingChange: (isSubmitting: boolean) => void;
  onEditModalExitTransitionEnd: () => void;
  onSubmitUpdateTransaction: (
    values: TransactionMutationValues,
  ) => Promise<void>;
  onCloseRebookModal: () => void;
  onRebookSubmittingChange: (isSubmitting: boolean) => void;
  onRebookModalExitTransitionEnd: () => void;
  onSubmitRebookBooking: (values: { targetAccountId: string }) => Promise<void>;
  onCloseDeleteModal: () => void;
  onConfirmDeleteTransaction: () => Promise<void>;
};

export function TransactionsPageView({
  onRefreshConstraints,
  rows,
  columnDefs,
  detailColumnDefs,
  accountBookStartDate,
  createModalOpened,
  editModalOpened,
  isCreateSubmitting,
  isEditSubmitting,
  isRebookSubmitting,
  createTransactionInitialValues,
  editingTransactionData,
  deletingTransaction,
  rebooking,
  rebookModalOpened,
  hasCompleteBookingUnit,
  accountOptions,
  editAccountOptions,
  rebookTargetAccountOptions,
  periodFilterControls,
  onRowDataUpdated,
  onAddTransactionClick,
  onCloseCreateModal,
  onCreateSubmittingChange,
  onSubmitCreateTransaction,
  onCloseEditModal,
  onEditSubmittingChange,
  onEditModalExitTransitionEnd,
  onSubmitUpdateTransaction,
  onCloseRebookModal,
  onRebookSubmittingChange,
  onRebookModalExitTransitionEnd,
  onSubmitRebookBooking,
  onCloseDeleteModal,
  onConfirmDeleteTransaction,
}: TransactionsPageViewProps) {
  const userLocale = useUserLocale();
  const createDialogText = getTransactionCreateDialogText(
    !!createTransactionInitialValues,
  );

  return (
    <PageShell>
      <TopPageHeader
        heading={<Title order={2}>Transactions</Title>}
        actions={
          <Group gap="sm">
            {periodFilterControls}
            <Button
              leftSection={<IconBolt size={16} />}
              onClick={onAddTransactionClick}
            >
              Add Transaction
            </Button>
          </Group>
        }
      />

      <DataGrid
        className="transactions-master-grid"
        containerStyle={{ flex: 1, minHeight: 0 }}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={{
          sortable: false,
          suppressHeaderMenuButton: true,
        }}
        getRowId={({ data }) => data.id}
        onRowDataUpdated={onRowDataUpdated}
        masterDetail
        detailRowAutoHeight
        suppressColumnVirtualisation
        detailCellRendererParams={{
          detailGridOptions: {
            columnDefs: detailColumnDefs,
            columnTypes,
            dataTypeDefinitions,
            context: { userLocale },
            defaultColDef: {
              sortable: false,
              suppressHeaderMenuButton: true,
            },
            getRowId: ({ data }: { data: TransactionsBookingRow }) => data.id,
          },
          getDetailRowData: ({
            data,
            successCallback,
          }: {
            data?: TransactionsRow;
            successCallback: (rowData: TransactionsBookingRow[]) => void;
          }) => {
            successCallback(data?.bookings ?? []);
          },
        }}
      />

      <Modal
        opened={createModalOpened}
        onClose={() => {
          if (isCreateSubmitting) return;
          onCloseCreateModal();
        }}
        title={createDialogText.title}
        size="100%"
        closeOnEscape={!isCreateSubmitting}
        closeOnClickOutside={!isCreateSubmitting}
        withCloseButton={!isCreateSubmitting}
      >
        <EditTransactionModal
          onRefreshConstraints={onRefreshConstraints}
          initialValues={createTransactionInitialValues}
          autoFocusDate={!!createTransactionInitialValues}
          submitLabel={createDialogText.submitLabel}
          accounts={accountOptions}
          accountBookStartDate={accountBookStartDate}
          onClose={() => {
            if (isCreateSubmitting) return;
            onCloseCreateModal();
          }}
          onSubmittingChange={onCreateSubmittingChange}
          onSubmit={onSubmitCreateTransaction}
        />
      </Modal>

      <Modal
        opened={editModalOpened}
        onClose={() => {
          if (isEditSubmitting) return;
          onCloseEditModal();
        }}
        title="Edit Transaction"
        size="100%"
        closeOnEscape={!isEditSubmitting}
        closeOnClickOutside={!isEditSubmitting}
        withCloseButton={!isEditSubmitting}
        onExitTransitionEnd={onEditModalExitTransitionEnd}
      >
        {editingTransactionData ? (
          <EditTransactionModal
            onRefreshConstraints={onRefreshConstraints}
            initialValues={editingTransactionData}
            accounts={editAccountOptions}
            accountBookStartDate={accountBookStartDate}
            onClose={() => {
              if (isEditSubmitting) return;
              onCloseEditModal();
            }}
            onSubmittingChange={onEditSubmittingChange}
            onSubmit={onSubmitUpdateTransaction}
          />
        ) : null}
      </Modal>

      <Modal
        opened={rebookModalOpened}
        onClose={() => {
          if (isRebookSubmitting) return;
          onCloseRebookModal();
        }}
        title="Rebook Booking"
        size="md"
        closeOnEscape={!isRebookSubmitting}
        closeOnClickOutside={!isRebookSubmitting}
        withCloseButton={!isRebookSubmitting}
        onExitTransitionEnd={onRebookModalExitTransitionEnd}
      >
        {rebooking && (
          <RebookBookingModal
            onRefreshConstraints={onRefreshConstraints}
            targetAccounts={rebookTargetAccountOptions}
            disabledReason={
              !hasCompleteBookingUnit
                ? "This booking has incomplete unit data and cannot be rebooked."
                : undefined
            }
            onClose={() => {
              if (isRebookSubmitting) return;
              onCloseRebookModal();
            }}
            onSubmittingChange={onRebookSubmittingChange}
            onSubmit={onSubmitRebookBooking}
          />
        )}
      </Modal>

      <ConfirmDeleteModal
        onRefreshConstraints={onRefreshConstraints}
        opened={!!deletingTransaction}
        onClose={onCloseDeleteModal}
        title="Delete Transaction"
        name={deletingTransaction?.description}
        onConfirm={onConfirmDeleteTransaction}
      />
    </PageShell>
  );
}

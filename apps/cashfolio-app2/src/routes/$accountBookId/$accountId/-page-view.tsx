import { IconBolt } from "@tabler/icons-react";
import { Badge, Button, Container, Group, Modal, Tooltip } from "@mantine/core";
import type { AgGridReactProps } from "ag-grid-react";
import { ConfirmDeleteModal } from "@/components/confirm-delete-modal";
import { DataGrid } from "@/components/data-grid";
import { AccountPathHeading } from "@/components/account-path-heading";
import {
  EditTransactionModal,
  type AccountOption,
  type BookingValues,
} from "@/components/edit-transaction-modal";
import { RebookBookingModal } from "@/components/rebook-booking-modal";
import {
  SimpleTransactionModal,
  type SimpleTransactionDirection,
  type SimpleTransactionDraftValues,
} from "@/components/simple-transaction-modal";
import { TopPageHeader } from "@/components/top-page-header";
import type { ReactNode } from "react";
import type { Unit } from "@/.prisma-client/enums";
import { getTypeLabel } from "@/shared/account-utils";
import type { TabValue } from "@/shared/account-tabs";
import type { SimpleTransactionEditInitialValues } from "./-page-data";
import type { loadLedgerPageData } from "./-page-loader";
import type { LedgerRow } from "./-page-types";

type LedgerPageLoaderData = Awaited<ReturnType<typeof loadLedgerPageData>>;

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

export type SplitModalInitialValues = {
  description?: string;
  bookings?: Omit<BookingValues, "key">[];
};

export type SimpleTransactionValues = {
  date: string;
  description: string;
  counterAccountId: string;
  amount: number;
  direction: SimpleTransactionDirection;
};

export type EditMode = "SIMPLE" | "SPLIT";

export type RebookingState = {
  bookingId: string;
  transactionId: string;
  bookingValue: number;
  bookingUnit: {
    unit: Unit | null;
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
  };
};

export type LedgerPageViewProps = {
  accountBookId: string;
  backTab: TabValue;
  account: LedgerPageLoaderData["account"];
  rows: LedgerRow[];
  columnDefs: NonNullable<AgGridReactProps<LedgerRow>["columnDefs"]>;
  currentAccountLabel: string;
  unitLabel: string | null;
  simpleTransactionDisabledReason: string | null;
  simpleModalOpened: boolean;
  splitModalOpened: boolean;
  editModalOpened: boolean;
  isSimpleSubmitting: boolean;
  isCreateSplitSubmitting: boolean;
  isEditSubmitting: boolean;
  isRebookSubmitting: boolean;
  editMode: EditMode;
  createSplitInitialValues?: SplitModalInitialValues;
  editingTransactionData?: {
    id: string;
    description?: string;
    bookings?: Omit<BookingValues, "key">[];
  };
  editingSimpleInitialValues?: SimpleTransactionEditInitialValues;
  deletingTransaction?: { id: string; description: string };
  rebooking?: RebookingState;
  rebookModalOpened: boolean;
  hasCompleteBookingUnit: boolean;
  accountOptions: AccountOption[];
  editAccountOptions: AccountOption[];
  simpleCounterAccountOptions: AccountOption[];
  editSimpleCounterAccountOptions: AccountOption[];
  rebookTargetAccountOptions: { value: string; label: string }[];
  periodFilterControls?: ReactNode;
  viewSwitcher?: ReactNode;
  onRowDataUpdated: AgGridReactProps<LedgerRow>["onRowDataUpdated"];
  onAddTransactionClick: () => void;
  onCloseSimpleModal: () => void;
  onSimpleSubmittingChange: (isSubmitting: boolean) => void;
  onSwitchCreateToSplit: (draft: SimpleTransactionDraftValues) => void;
  onSubmitCreateSimpleTransaction: (
    values: SimpleTransactionValues,
  ) => Promise<void>;
  onCloseSplitModal: () => void;
  onCreateSplitSubmittingChange: (isSubmitting: boolean) => void;
  onSubmitCreateTransaction: (
    values: TransactionMutationValues,
  ) => Promise<void>;
  onCloseEditModal: () => void;
  onEditSubmittingChange: (isSubmitting: boolean) => void;
  onEditModalExitTransitionEnd: () => void;
  onSwitchToSplit: (draft: SimpleTransactionDraftValues) => void;
  onSubmitUpdateSimpleTransaction: (
    values: SimpleTransactionValues,
  ) => Promise<void>;
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

export function LedgerPageView({
  accountBookId,
  backTab,
  account,
  rows,
  columnDefs,
  currentAccountLabel,
  unitLabel,
  simpleTransactionDisabledReason,
  simpleModalOpened,
  splitModalOpened,
  editModalOpened,
  isSimpleSubmitting,
  isCreateSplitSubmitting,
  isEditSubmitting,
  isRebookSubmitting,
  editMode,
  createSplitInitialValues,
  editingTransactionData,
  editingSimpleInitialValues,
  deletingTransaction,
  rebooking,
  rebookModalOpened,
  hasCompleteBookingUnit,
  accountOptions,
  editAccountOptions,
  simpleCounterAccountOptions,
  editSimpleCounterAccountOptions,
  rebookTargetAccountOptions,
  periodFilterControls,
  viewSwitcher,
  onRowDataUpdated,
  onAddTransactionClick,
  onCloseSimpleModal,
  onSimpleSubmittingChange,
  onSwitchCreateToSplit,
  onSubmitCreateSimpleTransaction,
  onCloseSplitModal,
  onCreateSplitSubmittingChange,
  onSubmitCreateTransaction,
  onCloseEditModal,
  onEditSubmittingChange,
  onEditModalExitTransitionEnd,
  onSwitchToSplit,
  onSubmitUpdateSimpleTransaction,
  onSubmitUpdateTransaction,
  onCloseRebookModal,
  onRebookSubmittingChange,
  onRebookModalExitTransitionEnd,
  onSubmitRebookBooking,
  onCloseDeleteModal,
  onConfirmDeleteTransaction,
}: LedgerPageViewProps) {
  return (
    <Container
      fluid
      py="xl"
      px="xl"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        minHeight: 0,
      }}
    >
      <TopPageHeader
        heading={
          <AccountPathHeading
            accountBookId={accountBookId}
            tab={backTab}
            mode={account.isActive ? "active" : "archived"}
            extraSegments={[
              getTypeLabel(account.type, account.equityAccountSubtype),
              ...account.groupPathSegments,
              account.name,
            ]}
          />
        }
        headingAccessory={
          unitLabel ? (
            <Badge size="lg" color="gray">
              {unitLabel}
            </Badge>
          ) : undefined
        }
        actions={
          <Group gap="sm">
            <Tooltip
              label={
                simpleTransactionDisabledReason
                  ? `${simpleTransactionDisabledReason} Split editor will open instead.`
                  : "Quick two-booking entry"
              }
            >
              <span>
                <Button
                  leftSection={<IconBolt size={16} />}
                  onClick={onAddTransactionClick}
                >
                  Add Transaction
                </Button>
              </span>
            </Tooltip>
            {viewSwitcher}
          </Group>
        }
      />

      {periodFilterControls}

      <DataGrid
        containerStyle={{ flex: 1, minHeight: 0 }}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={{
          sortable: false,
          suppressHeaderMenuButton: true,
        }}
        getRowId={({ data }) => data.id}
        onRowDataUpdated={onRowDataUpdated}
      />

      <Modal
        opened={simpleModalOpened}
        onClose={() => {
          if (isSimpleSubmitting) return;
          onCloseSimpleModal();
        }}
        title="Add Transaction"
        size="xl"
        closeOnEscape={!isSimpleSubmitting}
        closeOnClickOutside={!isSimpleSubmitting}
        withCloseButton={!isSimpleSubmitting}
      >
        <SimpleTransactionModal
          currentAccount={{ id: account.id, label: currentAccountLabel }}
          accounts={simpleCounterAccountOptions}
          onSwitchToSplit={onSwitchCreateToSplit}
          onClose={() => {
            if (isSimpleSubmitting) return;
            onCloseSimpleModal();
          }}
          onSubmittingChange={onSimpleSubmittingChange}
          onSubmit={onSubmitCreateSimpleTransaction}
        />
      </Modal>

      <Modal
        opened={splitModalOpened}
        onClose={() => {
          if (isCreateSplitSubmitting) return;
          onCloseSplitModal();
        }}
        title="Add Transaction"
        size="100%"
        closeOnEscape={!isCreateSplitSubmitting}
        closeOnClickOutside={!isCreateSplitSubmitting}
        withCloseButton={!isCreateSplitSubmitting}
      >
        <EditTransactionModal
          initialValues={createSplitInitialValues}
          submitLabel="Create"
          accounts={accountOptions}
          currentAccountId={account.id}
          onClose={() => {
            if (isCreateSplitSubmitting) return;
            onCloseSplitModal();
          }}
          onSubmittingChange={onCreateSplitSubmittingChange}
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
        size={editMode === "SIMPLE" ? "xl" : "100%"}
        closeOnEscape={!isEditSubmitting}
        closeOnClickOutside={!isEditSubmitting}
        withCloseButton={!isEditSubmitting}
        onExitTransitionEnd={onEditModalExitTransitionEnd}
      >
        {editingTransactionData &&
        editMode === "SIMPLE" &&
        editingSimpleInitialValues ? (
          <SimpleTransactionModal
            currentAccount={{ id: account.id, label: currentAccountLabel }}
            accounts={editSimpleCounterAccountOptions}
            initialValues={editingSimpleInitialValues}
            submitLabel="Save"
            onSwitchToSplit={onSwitchToSplit}
            onClose={() => {
              if (isEditSubmitting) return;
              onCloseEditModal();
            }}
            onSubmittingChange={onEditSubmittingChange}
            onSubmit={onSubmitUpdateSimpleTransaction}
          />
        ) : editingTransactionData ? (
          <EditTransactionModal
            initialValues={editingTransactionData}
            accounts={editAccountOptions}
            currentAccountId={account.id}
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
        opened={!!deletingTransaction}
        onClose={onCloseDeleteModal}
        title="Delete Transaction"
        name={deletingTransaction?.description}
        onConfirm={onConfirmDeleteTransaction}
      />
    </Container>
  );
}

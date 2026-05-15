import {
  IconArchive,
  IconArchiveOff,
  IconBolt,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { Badge, Button, Group, Modal, Tooltip } from "@mantine/core";
import type { AgGridReactProps } from "ag-grid-react";
import { ConfirmArchiveModal } from "@/components/confirm-archive-modal";
import { ConfirmDeleteModal } from "@/components/confirm-delete-modal";
import { DataGrid } from "@/components/data-grid";
import { AccountPathHeading } from "@/components/account-path-heading";
import {
  EditAccountModal,
  type AccountInitialValues,
  type TransformedFormValues,
} from "@/components/edit-account-modal";
import {
  EditTransactionModal,
  type AccountOption,
  type BookingValues,
} from "@/components/edit-transaction-modal";
import {
  RebookBookingModal,
  type RebookTargetOption,
} from "@/components/rebook-booking-modal";
import {
  SimpleTransactionModal,
  type SimpleTransactionDirection,
  type SimpleTransactionDraftValues,
} from "@/components/simple-transaction-modal";
import { SplitButton } from "@/components/split-button";
import { TopPageHeader } from "@/components/top-page-header";
import { PageShell } from "@/components/page-shell";
import type { ReactNode } from "react";
import type { Unit } from "@/.prisma-client/enums";
import type { AccountBookUnitUsage } from "@/shared/account-book-unit-usage";
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
  accountGroups: LedgerPageLoaderData["accountGroups"];
  existingNodes: LedgerPageLoaderData["existingNodes"];
  rows: LedgerRow[];
  columnDefs: NonNullable<AgGridReactProps<LedgerRow>["columnDefs"]>;
  currentAccountLabel: string;
  unitLabel: string | null;
  accountBookStartDate: Date;
  simpleTransactionDisabledReason: string | null;
  simpleModalOpened: boolean;
  splitModalOpened: boolean;
  accountEditModalOpened: boolean;
  accountEditInitialValues: AccountInitialValues;
  accountEditDisabledReason?: string;
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
  deletingAccount?: { id: string; name: string };
  archivingAccount?: { id: string; name: string };
  deletingTransaction?: { id: string; description: string };
  rebooking?: RebookingState;
  rebookModalOpened: boolean;
  hasCompleteBookingUnit: boolean;
  unitUsage: AccountBookUnitUsage;
  accountOptions: AccountOption[];
  editAccountOptions: AccountOption[];
  simpleCounterAccountOptions: AccountOption[];
  editSimpleCounterAccountOptions: AccountOption[];
  rebookTargetAccountOptions: RebookTargetOption[];
  accountArchivable: boolean;
  accountArchiveLabel: string;
  accountUnarchivable: boolean;
  accountUnarchiveLabel: string;
  accountDeletable: boolean;
  accountDeleteLabel: string;
  periodFilterControls?: ReactNode;
  onRowDataUpdated: AgGridReactProps<LedgerRow>["onRowDataUpdated"];
  onOpenAccountEdit: () => void;
  onCloseAccountEdit: () => void;
  onSubmitUpdateAccount: (values: TransformedFormValues) => Promise<void>;
  onOpenArchiveAccount: () => void;
  onCloseArchiveAccount: () => void;
  onConfirmArchiveAccount: () => Promise<void>;
  onUnarchiveAccount: () => Promise<void>;
  onOpenDeleteAccount: () => void;
  onCloseDeleteAccount: () => void;
  onConfirmDeleteAccount: () => Promise<void>;
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
  accountGroups,
  existingNodes,
  rows,
  columnDefs,
  currentAccountLabel,
  unitLabel,
  accountBookStartDate,
  simpleTransactionDisabledReason,
  simpleModalOpened,
  splitModalOpened,
  accountEditModalOpened,
  accountEditInitialValues,
  accountEditDisabledReason,
  editModalOpened,
  isSimpleSubmitting,
  isCreateSplitSubmitting,
  isEditSubmitting,
  isRebookSubmitting,
  editMode,
  createSplitInitialValues,
  editingTransactionData,
  editingSimpleInitialValues,
  deletingAccount,
  archivingAccount,
  deletingTransaction,
  rebooking,
  rebookModalOpened,
  hasCompleteBookingUnit,
  unitUsage,
  accountOptions,
  editAccountOptions,
  simpleCounterAccountOptions,
  editSimpleCounterAccountOptions,
  rebookTargetAccountOptions,
  accountArchivable,
  accountArchiveLabel,
  accountUnarchivable,
  accountUnarchiveLabel,
  accountDeletable,
  accountDeleteLabel,
  periodFilterControls,
  onRowDataUpdated,
  onOpenAccountEdit,
  onCloseAccountEdit,
  onSubmitUpdateAccount,
  onOpenArchiveAccount,
  onCloseArchiveAccount,
  onConfirmArchiveAccount,
  onUnarchiveAccount,
  onOpenDeleteAccount,
  onCloseDeleteAccount,
  onConfirmDeleteAccount,
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
    <PageShell>
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
            {periodFilterControls}
            <Tooltip
              label={accountEditDisabledReason ?? "Edit account"}
              disabled={!accountEditDisabledReason}
            >
              <span>
                <SplitButton
                  leftSection={<IconPencil size={16} />}
                  menuLabel="Account actions"
                  onClick={onOpenAccountEdit}
                  primaryDisabled={!!accountEditDisabledReason}
                  menuItems={[
                    account.isActive
                      ? {
                          key: "archive",
                          label: "Archive",
                          disabledReason: accountArchiveLabel,
                          disabled: !accountArchivable,
                          color: "yellow",
                          leftSection: <IconArchive size={16} />,
                          onClick: onOpenArchiveAccount,
                        }
                      : {
                          key: "unarchive",
                          label: "Unarchive",
                          disabledReason: accountUnarchiveLabel,
                          disabled: !accountUnarchivable,
                          color: "blue",
                          leftSection: <IconArchiveOff size={16} />,
                          onClick: () => void onUnarchiveAccount(),
                        },
                    {
                      key: "delete",
                      label: "Delete",
                      disabledReason: accountDeleteLabel,
                      disabled: !accountDeletable,
                      color: "red",
                      leftSection: <IconTrash size={16} />,
                      onClick: onOpenDeleteAccount,
                    },
                  ]}
                >
                  Edit
                </SplitButton>
              </span>
            </Tooltip>
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
          </Group>
        }
      />

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
          accountBookStartDate={accountBookStartDate}
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
          accountBookStartDate={accountBookStartDate}
          unitUsage={unitUsage}
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
            accountBookStartDate={accountBookStartDate}
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
            accountBookStartDate={accountBookStartDate}
            unitUsage={unitUsage}
            onClose={() => {
              if (isEditSubmitting) return;
              onCloseEditModal();
            }}
            onSubmittingChange={onEditSubmittingChange}
            onSubmit={onSubmitUpdateTransaction}
          />
        ) : null}
      </Modal>

      <EditAccountModal
        opened={accountEditModalOpened}
        onClose={onCloseAccountEdit}
        accountGroups={accountGroups}
        onSubmit={onSubmitUpdateAccount}
        initialValues={accountEditInitialValues}
        existingNodes={existingNodes}
        editingId={account.id}
        typeDescriptor={backTab}
      />

      <ConfirmArchiveModal
        opened={!!archivingAccount}
        onClose={onCloseArchiveAccount}
        title="Archive Account"
        name={archivingAccount?.name}
        onConfirm={onConfirmArchiveAccount}
      />

      <ConfirmDeleteModal
        opened={!!deletingAccount}
        onClose={onCloseDeleteAccount}
        title="Delete Account"
        name={deletingAccount?.name}
        onConfirm={onConfirmDeleteAccount}
      />

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
    </PageShell>
  );
}

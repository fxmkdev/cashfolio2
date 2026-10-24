import type { LedgerReturnTarget } from "@/shared/ledger-navigation";
import { Anchor } from "@mantine/core";
import {
  getAccountEntityLabel,
  getAccountManagementContext,
  getAccountConstraintMessage,
} from "@/shared/account-presentation";
import { UnarchiveMutationFeedback } from "@/components/dialogs/unarchive-mutation-feedback";
import type { useUnarchiveMutation } from "@/hooks/use-unarchive-mutation";
import {
  BulkTransactionToolbar,
  BulkTransactionDialogs,
} from "@/components/transactions/bulk-transaction-actions";
import type { BulkTransactionActions } from "@/hooks/use-bulk-transaction-actions";
import {
  IconArrowLeft,
  IconSettings,
  IconArchive,
  IconArchiveOff,
  IconBolt,
  IconFileImport,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { Badge, Button, Group, Modal, Title, Tooltip } from "@mantine/core";
import type { AgGridReactProps } from "ag-grid-react";
import { ConfirmArchiveModal } from "@/components/dialogs/confirm-archive-modal";
import { ConfirmDeleteModal } from "@/components/dialogs/confirm-delete-modal";
import { DataGrid } from "@/components/grid/data-grid";
import {
  EditAccountModal,
  type AccountInitialValues,
  type TransformedFormValues,
} from "@/components/account-editor/edit-account-modal";
import type { AccountOption } from "@/shared/account-options";
import {
  EditTransactionModal,
  type BookingValues,
} from "@/components/transaction-editor/edit-transaction-modal";
import {
  RebookBookingModal,
  type RebookTargetOption,
} from "@/components/transactions/rebook-booking-modal";
import {
  SimpleTransactionModal,
  type SimpleTransactionDirection,
  type SimpleTransactionDraftValues,
  type SimpleTransactionInitialValues,
} from "@/components/transactions/simple-transaction-modal";
import { SplitButton } from "@/components/controls/split-button";
import { getTransactionCreateDialogText } from "@/components/transactions/transaction-create-dialog-text";
import { TopPageHeader } from "@/components/layout/top-page-header";
import { PageShell } from "@/components/layout/page-shell";
import type { ReactNode } from "react";
import type { Unit } from "@/.prisma-client/enums";
import type { AccountBookUnitUsage } from "@/shared/account-book-unit-usage";
import type { TabValue } from "@/shared/account-tabs";
import {
  getLedgerAccountKindBadgeProps,
  type SimpleTransactionEditInitialValues,
} from "./page-data";
import { createLedgerAccountEditModalProps } from "./account-edit-modal-props";
import type { loadLedgerPageData } from "./page-loader";
import type { LedgerRow } from "./page-types";

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
  returnNavigation?: { target: LedgerReturnTarget; onReturn: () => void };
  onManageCategory?: () => void;
  onRefreshConstraints?: () => Promise<void>;
  bulkActions?: BulkTransactionActions<LedgerRow>;
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
  createSimpleInitialValues?: SimpleTransactionInitialValues;
  createSplitInitialValues?: SplitModalInitialValues;
  createSplitIsCopy?: boolean;
  createSplitDateAutoFocus?: boolean;
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
  statementImportDisabledReason: string | null;
  gainLossSection?: ReactNode;
  periodFilterControls?: ReactNode;
  onRowDataUpdated: AgGridReactProps<LedgerRow>["onRowDataUpdated"];
  onOpenAccountEdit: () => void;
  onCloseAccountEdit: () => void;
  onSubmitUpdateAccount: (values: TransformedFormValues) => Promise<void>;
  onOpenArchiveAccount: () => void;
  onCloseArchiveAccount: () => void;
  onConfirmArchiveAccount: () => Promise<void>;
  onUnarchiveAccount: () => Promise<void>;
  unarchiveRecovery?: ReturnType<typeof useUnarchiveMutation>;
  onOpenDeleteAccount: () => void;
  onCloseDeleteAccount: () => void;
  onConfirmDeleteAccount: () => Promise<void>;
  onAddTransactionClick: () => void;
  onCloseSimpleModal: () => void;
  onSimpleModalExitTransitionEnd: () => void;
  onSimpleSubmittingChange: (isSubmitting: boolean) => void;
  onSwitchCreateToSplit: (draft: SimpleTransactionDraftValues) => void;
  onSubmitCreateSimpleTransaction: (
    values: SimpleTransactionValues,
  ) => Promise<void>;
  onOpenImportPage: () => void;
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
  returnNavigation,
  onManageCategory,
  onRefreshConstraints,
  bulkActions,
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
  createSimpleInitialValues,
  createSplitInitialValues,
  createSplitIsCopy,
  createSplitDateAutoFocus,
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
  statementImportDisabledReason,
  gainLossSection,
  periodFilterControls,
  onRowDataUpdated,
  onOpenAccountEdit,
  onCloseAccountEdit,
  onSubmitUpdateAccount,
  onOpenArchiveAccount,
  onCloseArchiveAccount,
  onConfirmArchiveAccount,
  onUnarchiveAccount,
  unarchiveRecovery,
  onOpenDeleteAccount,
  onCloseDeleteAccount,
  onConfirmDeleteAccount,
  onAddTransactionClick,
  onCloseSimpleModal,
  onSimpleModalExitTransitionEnd,
  onSimpleSubmittingChange,
  onSwitchCreateToSplit,
  onSubmitCreateSimpleTransaction,
  onOpenImportPage,
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
  const entityLabel = getAccountEntityLabel(account);
  const context = getAccountManagementContext(account);
  const formatErrorMessage = (message: string) =>
    getAccountConstraintMessage(message, context) ?? message;
  const accountKindBadge = getLedgerAccountKindBadgeProps(account);
  const simpleCreateDialogText = getTransactionCreateDialogText(
    !!createSimpleInitialValues,
  );
  const splitCreateDialogText =
    getTransactionCreateDialogText(!!createSplitIsCopy);

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
      <TopPageHeader
        heading={<Title order={2}>{account.name}</Title>}
        headingAccessory={
          <>
            <Badge
              size="lg"
              color={accountKindBadge.color}
              variant={accountKindBadge.variant}
            >
              {accountKindBadge.label}
            </Badge>
            {unitLabel ? (
              <Badge size="lg" color="gray">
                {unitLabel}
              </Badge>
            ) : null}
            {!account.isActive ? (
              <Badge size="lg" color="gray">
                Archived
              </Badge>
            ) : null}
          </>
        }
        actions={
          <Group gap="sm">
            {periodFilterControls}
            <Tooltip
              label={
                getAccountConstraintMessage(
                  accountEditDisabledReason,
                  context,
                ) ?? `Edit ${entityLabel}`
              }
              disabled={!accountEditDisabledReason}
            >
              <span>
                <SplitButton
                  leftSection={<IconPencil size={16} />}
                  menuLabel={`${entityLabel} Actions`}
                  onClick={onOpenAccountEdit}
                  primaryDisabled={!!accountEditDisabledReason}
                  menuItems={[
                    ...(onManageCategory
                      ? [
                          {
                            key: "manage-category",
                            label: "Manage Category",
                            leftSection: <IconSettings size={16} />,
                            onClick: onManageCategory,
                          },
                        ]
                      : []),
                    {
                      key: "import-statement",
                      label: "Import Statement",
                      disabledReason:
                        statementImportDisabledReason ?? undefined,
                      disabled: !!statementImportDisabledReason,
                      leftSection: <IconFileImport size={16} />,
                      onClick: onOpenImportPage,
                    },
                    {
                      type: "divider",
                      key: "danger-actions-divider",
                    },
                    account.isActive
                      ? {
                          key: "archive",
                          label: "Archive",
                          disabledReason: getAccountConstraintMessage(
                            accountArchiveLabel,
                            context,
                          ),
                          disabled: !accountArchivable,
                          color: "yellow",
                          leftSection: <IconArchive size={16} />,
                          onClick: onOpenArchiveAccount,
                        }
                      : {
                          key: "unarchive",
                          label: "Unarchive",
                          disabledReason: getAccountConstraintMessage(
                            accountUnarchiveLabel,
                            context,
                          ),
                          disabled:
                            !accountUnarchivable ||
                            unarchiveRecovery?.isPending,
                          color: "blue",
                          leftSection: <IconArchiveOff size={16} />,
                          onClick: () => void onUnarchiveAccount(),
                        },
                    {
                      key: "delete",
                      label: "Delete",
                      disabledReason: getAccountConstraintMessage(
                        accountDeleteLabel,
                        context,
                      ),
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

      <UnarchiveMutationFeedback
        listLabel={
          entityLabel === "Category" ? "category list" : "account list"
        }
        recovery={unarchiveRecovery}
        onRefreshConstraints={onRefreshConstraints}
      />
      {bulkActions && <BulkTransactionToolbar actions={bulkActions} />}

      {gainLossSection}
      <DataGrid
        {...bulkActions?.gridProps}
        containerStyle={{ flex: 1, minHeight: 0 }}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={{
          sortable: false,
          suppressHeaderMenuButton: true,
        }}
        getRowId={({ data }) => data.id}
        onRowDataUpdated={(event) => {
          bulkActions?.gridProps.onRowDataUpdated?.(event);
          onRowDataUpdated?.(event);
        }}
      />

      {bulkActions && <BulkTransactionDialogs actions={bulkActions} />}

      <Modal
        opened={simpleModalOpened}
        onClose={() => {
          if (isSimpleSubmitting) return;
          onCloseSimpleModal();
        }}
        title={simpleCreateDialogText.title}
        size="xl"
        closeOnEscape={!isSimpleSubmitting}
        closeOnClickOutside={!isSimpleSubmitting}
        withCloseButton={!isSimpleSubmitting}
        onExitTransitionEnd={onSimpleModalExitTransitionEnd}
      >
        <SimpleTransactionModal
          onRefreshConstraints={onRefreshConstraints}
          currentAccount={{
            id: account.id,
            label: currentAccountLabel,
            entityLabel,
          }}
          accounts={
            createSimpleInitialValues
              ? editSimpleCounterAccountOptions
              : simpleCounterAccountOptions
          }
          initialValues={createSimpleInitialValues}
          accountBookStartDate={accountBookStartDate}
          autoFocusDate={!!createSimpleInitialValues}
          submitLabel={simpleCreateDialogText.submitLabel}
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
        title={splitCreateDialogText.title}
        size="100%"
        closeOnEscape={!isCreateSplitSubmitting}
        closeOnClickOutside={!isCreateSplitSubmitting}
        withCloseButton={!isCreateSplitSubmitting}
      >
        <EditTransactionModal
          onRefreshConstraints={onRefreshConstraints}
          initialValues={createSplitInitialValues}
          submitLabel={splitCreateDialogText.submitLabel}
          accounts={
            createSplitInitialValues ? editAccountOptions : accountOptions
          }
          currentAccountId={account.id}
          accountBookStartDate={accountBookStartDate}
          unitUsage={unitUsage}
          autoFocusDate={createSplitDateAutoFocus}
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
            onRefreshConstraints={onRefreshConstraints}
            currentAccount={{
              id: account.id,
              label: currentAccountLabel,
              entityLabel,
            }}
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
            onRefreshConstraints={onRefreshConstraints}
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
        onRefreshConstraints={onRefreshConstraints}
        {...createLedgerAccountEditModalProps({
          opened: accountEditModalOpened,
          onClose: onCloseAccountEdit,
          accountGroups,
          unitUsage,
          onSubmit: onSubmitUpdateAccount,
          initialValues: accountEditInitialValues,
          existingNodes,
          editingId: account.id,
          typeDescriptor: backTab,
        })}
      />

      <ConfirmArchiveModal
        formatErrorMessage={formatErrorMessage}
        onRefreshConstraints={onRefreshConstraints}
        opened={!!archivingAccount}
        onClose={onCloseArchiveAccount}
        title={`Archive ${entityLabel}`}
        name={archivingAccount?.name}
        onConfirm={onConfirmArchiveAccount}
      />

      <ConfirmDeleteModal
        formatErrorMessage={formatErrorMessage}
        onRefreshConstraints={onRefreshConstraints}
        opened={!!deletingAccount}
        onClose={onCloseDeleteAccount}
        title={`Delete ${entityLabel}`}
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

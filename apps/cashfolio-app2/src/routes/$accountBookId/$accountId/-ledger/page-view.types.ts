import type { ReactNode } from "react";
import type { AgGridReactProps } from "ag-grid-react";
import type { LedgerReturnTarget } from "@/shared/ledger-navigation";
import type { useUnarchiveMutation } from "@/hooks/use-unarchive-mutation";
import type { BulkTransactionActions } from "@/hooks/use-bulk-transaction-actions";
import type {
  AccountInitialValues,
  TransformedFormValues,
} from "@/components/account-editor/edit-account-modal";
import type { RebookTargetOption } from "@/components/transactions/rebook-booking-modal";
import type { TabValue } from "@/shared/account-tabs";
import type { loadLedgerPageData } from "./page-loader";
import type { LedgerRow } from "./page-types";
import type { LedgerAccountSwitcherProps } from "./account-switcher";

type LedgerPageLoaderData = Awaited<ReturnType<typeof loadLedgerPageData>>;

import type {
  LedgerTransactionCreateDialogsProps,
  LedgerTransactionEditDialogProps,
  RebookingState,
} from "./transaction-dialog.types";
export type {
  TransactionBookingInput,
  TransactionMutationValues,
  SplitModalInitialValues,
  SimpleTransactionValues,
  EditMode,
  RebookingState,
} from "./transaction-dialog.types";
export type LedgerPageViewProps = LedgerTransactionCreateDialogsProps &
  LedgerTransactionEditDialogProps & {
    accountSwitcher?: Omit<LedgerAccountSwitcherProps, "account">;
    returnNavigation?: { target: LedgerReturnTarget; onReturn: () => void };
    onManageCategory?: () => void;
    bulkActions?: BulkTransactionActions<LedgerRow>;
    backTab: TabValue;
    accountGroups: LedgerPageLoaderData["accountGroups"];
    existingNodes: LedgerPageLoaderData["existingNodes"];
    rows: LedgerRow[];
    columnDefs: NonNullable<AgGridReactProps<LedgerRow>["columnDefs"]>;
    unitLabel: string | null;
    simpleTransactionDisabledReason: string | null;
    accountEditModalOpened: boolean;
    accountEditInitialValues: AccountInitialValues;
    accountEditDisabledReason?: string;
    isRebookSubmitting: boolean;
    deletingAccount?: { id: string; name: string };
    archivingAccount?: { id: string; name: string };
    deletingTransaction?: { id: string; description: string };
    rebooking?: RebookingState;
    rebookModalOpened: boolean;
    hasCompleteBookingUnit: boolean;
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
    onOpenImportPage: () => void;
    onCloseRebookModal: () => void;
    onRebookSubmittingChange: (isSubmitting: boolean) => void;
    onRebookModalExitTransitionEnd: () => void;
    onSubmitRebookBooking: (values: {
      targetAccountId: string;
    }) => Promise<void>;
    onCloseDeleteModal: () => void;
    onConfirmDeleteTransaction: () => Promise<void>;
  };

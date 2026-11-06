import type { ReactNode } from "react";
import type { AgGridReactProps } from "ag-grid-react";
import type { Unit } from "@/.prisma-client/enums";
import type { LedgerReturnTarget } from "@/shared/ledger-navigation";
import type { useUnarchiveMutation } from "@/hooks/use-unarchive-mutation";
import type { BulkTransactionActions } from "@/hooks/use-bulk-transaction-actions";
import type {
  AccountInitialValues,
  TransformedFormValues,
} from "@/components/account-editor/edit-account-modal";
import type { BookingValues } from "@/components/transaction-editor/edit-transaction-modal";
import type { RebookTargetOption } from "@/components/transactions/rebook-booking-modal";
import type {
  SimpleTransactionDirection,
  SimpleTransactionDraftValues,
  SimpleTransactionInitialValues,
} from "@/components/transactions/simple-transaction-modal";
import type { AccountOption } from "@/shared/account-options";
import type { AccountBookUnitUsage } from "@/shared/account-book-unit-usage";
import type { TabValue } from "@/shared/account-tabs";
import type { SimpleTransactionEditInitialValues } from "./page-data";
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

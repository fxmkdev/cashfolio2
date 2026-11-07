import type { Unit } from "@/.prisma-client/enums";
import type { BookingValues } from "@/components/transaction-editor/edit-transaction-modal";
import type {
  SimpleTransactionDirection,
  SimpleTransactionDraftValues,
  SimpleTransactionInitialValues,
} from "@/components/transactions/simple-transaction-modal";
import type { AccountOption } from "@/shared/account-options";
import type { AccountBookUnitUsage } from "@/shared/account-book-unit-usage";
import type { SimpleTransactionEditInitialValues } from "./page-data";
import type { loadLedgerPageData } from "./page-loader";
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

type TransactionDialogContext = {
  account: LedgerPageLoaderData["account"];
  currentAccountLabel: string;
  accountBookStartDate: Date;
  onRefreshConstraints?: () => Promise<void>;
  editSimpleCounterAccountOptions: AccountOption[];
  editAccountOptions: AccountOption[];
  unitUsage: AccountBookUnitUsage;
};

export type LedgerTransactionCreateDialogsProps = TransactionDialogContext & {
  simpleModalOpened: boolean;
  isSimpleSubmitting: boolean;
  onCloseSimpleModal: () => void;
  onSimpleModalExitTransitionEnd: () => void;
  createSimpleInitialValues?: SimpleTransactionInitialValues;
  simpleCounterAccountOptions: AccountOption[];
  onSwitchCreateToSplit: (draft: SimpleTransactionDraftValues) => void;
  onSimpleSubmittingChange: (isSubmitting: boolean) => void;
  onSubmitCreateSimpleTransaction: (
    values: SimpleTransactionValues,
  ) => Promise<void>;
  splitModalOpened: boolean;
  isCreateSplitSubmitting: boolean;
  onCloseSplitModal: () => void;
  createSplitInitialValues?: SplitModalInitialValues;
  createSplitIsCopy?: boolean;
  createSplitDateAutoFocus?: boolean;
  accountOptions: AccountOption[];
  onCreateSplitSubmittingChange: (isSubmitting: boolean) => void;
  onSubmitCreateTransaction: (
    values: TransactionMutationValues,
  ) => Promise<void>;
  onCreateSplitModalExitTransitionEnd?: () => void;
};

export type LedgerTransactionEditDialogProps = TransactionDialogContext & {
  editModalOpened: boolean;
  isEditSubmitting: boolean;
  onCloseEditModal: () => void;
  editMode: EditMode;
  onEditModalExitTransitionEnd: () => void;
  editingTransactionData?: {
    id: string;
    description?: string;
    bookings?: Omit<BookingValues, "key">[];
  };
  editingSimpleInitialValues?: SimpleTransactionEditInitialValues;
  onSwitchToSplit: (draft: SimpleTransactionDraftValues) => void;
  onEditSubmittingChange: (isSubmitting: boolean) => void;
  onSubmitUpdateSimpleTransaction: (
    values: SimpleTransactionValues,
  ) => Promise<void>;
  onSubmitUpdateTransaction: (
    values: TransactionMutationValues,
  ) => Promise<void>;
};

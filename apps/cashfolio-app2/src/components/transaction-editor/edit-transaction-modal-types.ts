import type { Unit } from "../../.prisma-client/enums";
import type { UseFormReturnType } from "@mantine/form";
import type { AccountOption } from "@/shared/accounts/account-options";
import type { AccountBookUnitUsage } from "@/shared/accounts/account-book-unit-usage";

export type { AccountOption } from "../../shared/accounts/account-options";

export type BookingValues = {
  key: string;
  date?: string | Date;
  account?: string;
  description?: string;
  unit?: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
  debit?: number;
  credit?: number;
};

export type TransactionFormValues = {
  date?: Date;
  description?: string;
  bookings: BookingValues[];
};

export type TransactionSubmitValues = {
  description: string;
  bookings: {
    date: string;
    accountId: string;
    description: string;
    unit: Unit;
    currency?: string;
    cryptocurrency?: string;
    symbol?: string;
    tradeCurrency?: string;
    value: number;
  }[];
};

export type EditTransactionModalProps = {
  initialValues?: {
    description?: string;
    bookings?: Omit<BookingValues, "key">[];
  };
  submitLabel?: string;
  accounts: AccountOption[];
  accountBookStartDate: Date;
  unitUsage?: AccountBookUnitUsage;
  currentAccountId?: string;
  autoFocusDate?: boolean;
  onClose: () => void;
  onRefreshConstraints?: () => Promise<void>;
  onSubmittingChange?: (isSubmitting: boolean) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onSubmit: (values: TransactionSubmitValues) => Promise<void>;
  onDeleteTransaction?: () => void;
};

export type TransactionForm = UseFormReturnType<TransactionFormValues>;

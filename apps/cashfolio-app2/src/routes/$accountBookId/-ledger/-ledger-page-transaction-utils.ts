import { AccountType } from "../../../.prisma-client/enums";
import type { AccountOption } from "../../../components/edit-transaction-modal";
import type {
  SimpleTransactionDraftValues,
  SimpleTransactionDirection,
} from "../../../components/simple-transaction-modal";
import {
  getBookingUnitFields,
  type BookingUnitFieldsSource,
} from "../../../shared/booking-unit-fields";
import type {
  SimpleTransactionValues,
  SplitModalInitialValues,
  TransactionBookingInput,
  TransactionMutationValues,
} from "./-ledger-page-view";

export type SimpleTransactionEditInitialValues = {
  date: Date;
  description: string;
  counterAccountId: string;
  amount: number;
  direction: SimpleTransactionDirection;
};

export function buildSimpleTransactionValues(args: {
  values: SimpleTransactionValues;
  currentAccount: { id: string } & BookingUnitFieldsSource;
  counterAccount: AccountOption;
}): TransactionMutationValues {
  const currentUnitFields = getBookingUnitFields(
    args.currentAccount,
    "current account",
  );
  const counterUnitFields =
    args.counterAccount.type === AccountType.EQUITY
      ? currentUnitFields
      : getBookingUnitFields(args.counterAccount, "counter account");

  const currentValue =
    args.values.direction === "DEBIT"
      ? args.values.amount
      : -args.values.amount;

  return {
    description: args.values.description,
    bookings: [
      {
        date: args.values.date,
        accountId: args.currentAccount.id,
        description: "",
        ...currentUnitFields,
        value: currentValue,
      },
      {
        date: args.values.date,
        accountId: args.values.counterAccountId,
        description: "",
        ...counterUnitFields,
        value: -currentValue,
      },
    ],
  };
}

export function normalizeSimpleDraft(args: {
  draft: SimpleTransactionDraftValues;
  fallback: SimpleTransactionEditInitialValues;
}): SimpleTransactionValues {
  const amount = Number(args.draft.amount);
  const nextAmount =
    Number.isFinite(amount) && amount > 0 ? amount : args.fallback.amount;

  const date =
    args.draft.date && !isNaN(args.draft.date.getTime())
      ? args.draft.date
      : args.fallback.date;

  return {
    date: date.toISOString(),
    description: args.draft.description,
    counterAccountId:
      args.draft.counterAccountId || args.fallback.counterAccountId,
    amount: nextAmount,
    direction: args.draft.direction ?? args.fallback.direction,
  };
}

export function toEditTransactionData(
  id: string,
  description: string,
  bookings: TransactionBookingInput[],
): {
  id: string;
  description: string;
  bookings: {
    date: string;
    account: string;
    description: string;
    unit: TransactionBookingInput["unit"];
    currency: string | undefined;
    cryptocurrency: string | undefined;
    symbol: string | undefined;
    tradeCurrency: string | undefined;
    debit: number | undefined;
    credit: number | undefined;
  }[];
} {
  return {
    id,
    description,
    bookings: bookings.map((booking) => ({
      date: booking.date,
      account: booking.accountId,
      description: booking.description,
      unit: booking.unit,
      currency: booking.currency ?? undefined,
      cryptocurrency: booking.cryptocurrency ?? undefined,
      symbol: booking.symbol ?? undefined,
      tradeCurrency: booking.tradeCurrency ?? undefined,
      debit: booking.value > 0 ? booking.value : undefined,
      credit: booking.value < 0 ? -booking.value : undefined,
    })),
  };
}

export function toCreateSplitInitialValues(
  description: string,
  bookings: TransactionBookingInput[],
): SplitModalInitialValues {
  return {
    description,
    bookings: bookings.map((booking) => ({
      date: booking.date,
      account: booking.accountId,
      description: booking.description,
      unit: booking.unit,
      currency: booking.currency,
      cryptocurrency: booking.cryptocurrency,
      symbol: booking.symbol,
      tradeCurrency: booking.tradeCurrency,
      debit: booking.value > 0 ? booking.value : undefined,
      credit: booking.value < 0 ? -booking.value : undefined,
    })),
  };
}

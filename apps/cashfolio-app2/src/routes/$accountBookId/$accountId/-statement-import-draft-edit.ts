import type { AccountOption } from "@/components/edit-transaction-modal";
import type { BookingValues } from "@/components/edit-transaction-modal-types";
import { createBookingUnitDefaults } from "@/components/edit-transaction-modal-unit-defaults";
import { getUnitIdentifier } from "@/shared/account-utils";
import { toMoney } from "@/shared/money";
import type { TransactionMutationValues } from "./-page-view";
import type { StatementImportDraft } from "./-statement-import-types";

export function toStatementImportEditInitialValues(
  draft: StatementImportDraft,
): {
  description: string;
  bookings: Omit<BookingValues, "key">[];
} {
  return {
    description: draft.transaction.description,
    bookings: draft.transaction.bookings.map((booking) => ({
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

export function updateStatementImportDraftTransaction(args: {
  draft: StatementImportDraft;
  transaction: TransactionMutationValues;
}): StatementImportDraft {
  const currentAccountId = args.draft.currentAccountId;
  const currentBooking =
    args.transaction.bookings.find(
      (booking) => booking.accountId === currentAccountId,
    ) ?? args.transaction.bookings[0];
  const previousCurrentBookings = args.draft.transaction.bookings.filter(
    (booking) => booking.accountId === currentAccountId,
  );
  const nextCurrentBookings = args.transaction.bookings.filter(
    (booking) => booking.accountId === currentAccountId,
  );
  const currentBookingsUnchanged =
    previousCurrentBookings.length === nextCurrentBookings.length &&
    previousCurrentBookings.every((booking, index) => {
      const nextBooking = nextCurrentBookings[index];
      return (
        booking.date === nextBooking.date &&
        toMoney(booking.value).equals(nextBooking.value) &&
        getUnitIdentifier(booking) === getUnitIdentifier(nextBooking)
      );
    });

  return {
    ...args.draft,
    matchedExistingBooking: currentBookingsUnchanged
      ? args.draft.matchedExistingBooking
      : undefined,
    date: currentBooking?.date ?? args.draft.date,
    amount: currentBooking?.value ?? args.draft.amount,
    counterAccountId: getCounterAccountIdFromTransaction({
      currentAccountId,
      transaction: args.transaction,
    }),
    description: args.transaction.description,
    transaction: args.transaction,
  };
}

export function updateStatementImportDraftDescription(args: {
  draft: StatementImportDraft;
  description: string;
}): StatementImportDraft {
  return {
    ...args.draft,
    description: args.description,
    transaction: {
      ...args.draft.transaction,
      description: args.description,
    },
  };
}

export function updateStatementImportDraftCounterAccount(args: {
  draft: StatementImportDraft;
  selectedAccount: AccountOption | undefined;
}): StatementImportDraft {
  if (!hasStatementImportSingleCounterBooking(args.draft)) {
    return args.draft;
  }

  const counterBookingIndex = findStatementImportCounterBookingIndex(
    args.draft,
  );
  if (counterBookingIndex === -1) {
    return args.draft;
  }

  const transaction = args.draft.transaction;
  const currentBooking = transaction.bookings.find(
    (booking) => booking.accountId === args.draft.currentAccountId,
  );
  const counterBooking = transaction.bookings[counterBookingIndex];
  if (!counterBooking) {
    return args.draft;
  }

  if (!args.selectedAccount) {
    return updateStatementImportDraftTransaction({
      draft: args.draft,
      transaction: {
        ...transaction,
        bookings: transaction.bookings.map((booking, index) =>
          index === counterBookingIndex
            ? { ...booking, accountId: "" }
            : booking,
        ),
      },
    });
  }

  const selectedAccount = args.selectedAccount;
  const unitDefaults = createBookingUnitDefaults({
    selectedAccount,
    lockedBooking: currentBooking ? toBookingValues(currentBooking) : undefined,
    currentBooking: toBookingValues(counterBooking),
    preserveCurrentBookingUnitForUnitlessEquity: true,
  });

  return updateStatementImportDraftTransaction({
    draft: args.draft,
    transaction: {
      ...transaction,
      bookings: transaction.bookings.map((booking, index) =>
        index === counterBookingIndex
          ? {
              ...booking,
              accountId: selectedAccount.value,
              ...unitDefaults,
            }
          : booking,
      ),
    },
  });
}

export function getStatementImportCounterAccountId(
  draft: StatementImportDraft,
): string {
  const counterBookingIndex = findStatementImportCounterBookingIndex(draft);
  return counterBookingIndex === -1
    ? ""
    : (draft.transaction.bookings[counterBookingIndex]?.accountId ?? "");
}

export function hasStatementImportSingleCounterBooking(
  draft: StatementImportDraft,
): boolean {
  return (
    draft.transaction.bookings.filter(
      (booking) => booking.accountId !== draft.currentAccountId,
    ).length === 1
  );
}

function findStatementImportCounterBookingIndex(
  draft: StatementImportDraft,
): number {
  return draft.transaction.bookings.findIndex(
    (booking) => booking.accountId !== draft.currentAccountId,
  );
}

function getCounterAccountIdFromTransaction(args: {
  currentAccountId: string | undefined;
  transaction: TransactionMutationValues;
}): string {
  return (
    args.transaction.bookings.find(
      (booking) =>
        booking.accountId !== "" && booking.accountId !== args.currentAccountId,
    )?.accountId ?? ""
  );
}

function toBookingValues(
  booking: TransactionMutationValues["bookings"][number],
): BookingValues {
  return {
    key: "",
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
  };
}

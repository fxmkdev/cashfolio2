import { isBefore } from "date-fns";
import { Unit } from "@/.prisma-client/enums";
import type { AccountOption } from "@/components/edit-transaction-modal";
import {
  getUnitIdentifier,
  isExpenseAccount,
  isIncomeAccount,
  isOpeningBalancesAccount,
} from "@/shared/account-utils";
import { formatUtcDate, parseUtcDayDate, startOfUtcDay } from "@/shared/date";
import { OPENING_BALANCES_MANAGEMENT_MESSAGE } from "@/shared/opening-balances";
import type {
  StatementImportDraft,
  StatementImportDraftStatus,
} from "./-statement-import-types";

export function getStatementImportDraftStatus(args: {
  draft: StatementImportDraft;
  accounts: AccountOption[];
  accountBookStartDate: Date;
}): StatementImportDraftStatus {
  if (args.draft.ignored) {
    return {
      kind: "ignored",
      label: args.draft.matchedExistingBooking ? "Already exists" : "Ignored",
      color: "gray",
      message: args.draft.matchedExistingBooking
        ? "An existing booking in this account has the same date and amount. Check this row to import it anyway."
        : "This row will not be imported.",
    };
  }

  const bookings = args.draft.transaction.bookings;
  const accountBookStartDay = startOfUtcDay(args.accountBookStartDate);
  const accountBookStartDateLabel = formatUtcDate(accountBookStartDay);

  if (
    !bookings.some(
      (booking) => booking.accountId === args.draft.currentAccountId,
    )
  ) {
    return error(
      "Imported transaction must include the current ledger account.",
    );
  }

  for (let index = 0; index < bookings.length; index += 1) {
    const booking = bookings[index];
    if (!booking.accountId) {
      return needsEdit("Counter account is required.");
    }

    const account = args.accounts.find(
      (candidate) => candidate.value === booking.accountId,
    );
    if (!account) {
      return error(`Booking ${index + 1}: account is not available.`);
    }
    if (isOpeningBalancesAccount(account)) {
      return error(OPENING_BALANCES_MANAGEMENT_MESSAGE);
    }
    if (isIncomeAccount(account) && booking.value > 0) {
      return error("Income accounts cannot have debit entries.");
    }
    if (isExpenseAccount(account) && booking.value < 0) {
      return error("Expense accounts cannot have credit entries.");
    }

    const bookingDate = parseUtcDayDate(booking.date);
    if (!bookingDate) {
      return error(`Booking ${index + 1}: date must be a valid UTC day.`);
    }
    const bookingDay = startOfUtcDay(bookingDate);
    if (isBefore(bookingDay, accountBookStartDay)) {
      return error(
        `Booking ${index + 1}: Date cannot be before account book start date (${accountBookStartDateLabel}).`,
      );
    }

    if (!booking.unit) {
      return error(`Booking ${index + 1}: unit is required.`);
    }
    if (booking.unit === Unit.CURRENCY && !booking.currency) {
      return error(`Booking ${index + 1}: currency is required.`);
    }
    if (booking.unit === Unit.CRYPTOCURRENCY && !booking.cryptocurrency) {
      return error(`Booking ${index + 1}: cryptocurrency is required.`);
    }
    if (
      booking.unit === Unit.SECURITY &&
      (!booking.symbol || !booking.tradeCurrency)
    ) {
      return error(
        `Booking ${index + 1}: symbol and trade currency are required.`,
      );
    }
    if (booking.value === 0) {
      return error(`Booking ${index + 1}: value must be non-zero.`);
    }
  }

  const unitIdentifiers = new Set(
    bookings.map((booking) => getUnitIdentifier(booking)),
  );
  if (unitIdentifiers.size === 1) {
    const sum = bookings.reduce((acc, booking) => acc + booking.value, 0);
    if (Math.abs(sum) > 0.001) {
      return error("The sum of all bookings must be zero.");
    }
  }

  return {
    kind: "ready",
    label: "Ready",
    color: "green",
    message: null,
  };
}

function needsEdit(message: string): StatementImportDraftStatus {
  return {
    kind: "needs-edit",
    label: "Needs edit",
    color: "yellow",
    message,
  };
}

function error(message: string): StatementImportDraftStatus {
  return {
    kind: "error",
    label: "Error",
    color: "red",
    message,
  };
}

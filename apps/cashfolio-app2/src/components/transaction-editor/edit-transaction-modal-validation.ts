import { RESOURCE_LIMITS } from "../../shared/resources/resource-limits";
import { Unit } from "../../.prisma-client/enums";
import {
  getUnitIdentifier,
  isExpenseAccount,
  isIncomeAccount,
  isOpeningBalancesAccount,
} from "../../shared/accounts/account-utils";
import { moneyIsZero, moneySubtract, moneySum } from "../../shared/money";
import { validateGainLossSimpleTransactionInvariant } from "../../shared/transactions/gain-loss-transaction-invariant";
import { OPENING_BALANCES_MANAGEMENT_MESSAGE } from "../../shared/accounts/opening-balances";
import { numericFormatter } from "react-number-format";
import type { AccountOption } from "@/shared/accounts/account-options";
import type {
  BookingValues,
  TransactionFormValues,
} from "./edit-transaction-modal-types";
import {
  formRootRule,
  isNotEmpty,
  type FormValidateInput,
} from "@mantine/form";
import {
  formatUtcDateForLocale,
  normalizeDateInputValueToUtcDay,
  startOfUtcDay,
} from "@/shared/date";
import { getNumberFormatSymbols } from "../controls/formatted-number-input";

export function validateEditTransactionBookingsRoot(args: {
  bookings: BookingValues[];
  accounts: AccountOption[];
  thousandSeparator: string | undefined;
  decimalSeparator: string | undefined;
}): string | null {
  const { bookings, accounts, thousandSeparator, decimalSeparator } = args;

  if (bookings.length > RESOURCE_LIMITS.bookingsPerTransaction)
    return "A transaction cannot exceed 100 bookings.";
  for (const booking of bookings) {
    if ((booking.description?.length ?? 0) > RESOURCE_LIMITS.description)
      return "Booking descriptions cannot exceed 4’000 characters.";
    if (!booking.account) continue;

    const account = accounts.find(
      (candidate) => candidate.value === booking.account,
    );
    if (!account)
      return "A selected account is no longer available. Choose another account.";

    if (isIncomeAccount(account) && booking.debit !== undefined) {
      return "Income categories cannot have debit entries.";
    }
    if (isExpenseAccount(account) && booking.credit !== undefined) {
      return "Expense categories cannot have credit entries.";
    }
    if (isOpeningBalancesAccount(account)) {
      return OPENING_BALANCES_MANAGEMENT_MESSAGE;
    }
  }

  const bookingAccounts = bookings
    .map((booking) => {
      if (!booking.account) return null;
      return (
        accounts.find((account) => account.value === booking.account) ?? null
      );
    })
    .filter((account): account is AccountOption => account !== null);
  if (bookingAccounts.length === bookings.length) {
    const gainLossInvariantError =
      validateGainLossSimpleTransactionInvariant(bookingAccounts);
    if (gainLossInvariantError) {
      return gainLossInvariantError;
    }
  }

  const unitIdentifiers = new Set(
    bookings
      .filter(
        (booking): booking is BookingValues & { unit: Unit } =>
          booking.unit != null,
      )
      .map((booking) => getUnitIdentifier(booking)),
  );
  if (unitIdentifiers.size !== 1) return null;

  const difference = moneySubtract(
    moneySum(bookings.map((booking) => booking.debit ?? 0)),
    moneySum(bookings.map((booking) => booking.credit ?? 0)),
  );
  return !moneyIsZero(difference)
    ? `Transaction is not balanced; debits and credits differ by ${numericFormatter(
        difference.toString(),
        {
          thousandSeparator,
          decimalSeparator,
        },
      )}.`
    : null;
}

export function validateEditTransactionDate(args: {
  value: Date | string | null | undefined;
  accountBookStartDay: Date;
  locale: string;
}): string | null {
  const date = normalizeDateInputValueToUtcDay(args.value, args.locale);
  if (!date) return args.value ? "Date is invalid" : "Date is required";
  return startOfUtcDay(date) < args.accountBookStartDay
    ? `Date cannot be before account book start date (${formatUtcDateForLocale(args.accountBookStartDay, args.locale)}).`
    : null;
}

export function createEditTransactionValidation(args: {
  accounts: AccountOption[];
  accountBookStartDay: Date;
  locale: string;
}): FormValidateInput<TransactionFormValues> {
  const { thousandSeparator, decimalSeparator } = getNumberFormatSymbols(
    args.locale,
  );
  const validateDate = (value: Date | string | null | undefined) =>
    validateEditTransactionDate({ ...args, value });
  return {
    description: (value) =>
      value && value.length > RESOURCE_LIMITS.description
        ? "Description cannot exceed 4’000 characters."
        : null,
    date: validateDate,
    bookings: {
      [formRootRule]: (bookings) =>
        validateEditTransactionBookingsRoot({
          bookings,
          accounts: args.accounts,
          thousandSeparator,
          decimalSeparator,
        }),
      date: validateDate,
      account: (value) =>
        !value
          ? "Account or category is required"
          : args.accounts.some((account) => account.value === value)
            ? null
            : "The selected account or category is no longer available. Choose another account or category.",
      unit: isNotEmpty("Unit is required"),
      debit: (value) => (value === 0 ? "Must be non-zero" : null),
      credit: (value) => (value === 0 ? "Must be non-zero" : null),
    },
  };
}

import { RESOURCE_LIMITS } from "../../shared/resource-limits";
import { Unit } from "../../.prisma-client/enums";
import {
  getUnitIdentifier,
  isExpenseAccount,
  isIncomeAccount,
  isOpeningBalancesAccount,
} from "../../shared/account-utils";
import { moneyIsZero, moneySubtract, moneySum } from "../../shared/money";
import { validateGainLossSimpleTransactionInvariant } from "../../shared/gain-loss-transaction-invariant";
import { OPENING_BALANCES_MANAGEMENT_MESSAGE } from "../../shared/opening-balances";
import { numericFormatter } from "react-number-format";
import type { AccountOption } from "@/shared/account-options";
import type { BookingValues } from "./edit-transaction-modal-types";

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

import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { isBefore } from "date-fns";
import { formatUtcDate, startOfUtcDay } from "../shared/date";
import {
  getAccountUnitIdentifier,
  getBookingUnitIdentifier,
  isBookingValueCompatibleWithAccountType,
} from "../shared/account-utils";
import { OPENING_BALANCES_MANAGEMENT_MESSAGE } from "../shared/opening-balances";

export type RebookBookingValidationInput = {
  accountId: string;
  date: Date;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  value: number;
};

export type RebookTargetAccountValidationInput = {
  id: string;
  isActive: boolean;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
};

export function validateRebookBookingTarget(args: {
  booking: RebookBookingValidationInput;
  targetAccount: RebookTargetAccountValidationInput;
  accountBookStartDate?: Date;
  sourceTransactionContainsOpeningBalancesBooking?: boolean;
}) {
  const {
    booking,
    targetAccount,
    accountBookStartDate,
    sourceTransactionContainsOpeningBalancesBooking,
  } = args;

  if (!targetAccount.isActive) {
    throw new Error("Target account must be active.");
  }

  if (booking.accountId === targetAccount.id) {
    throw new Error(
      "Target account must be different from the current account.",
    );
  }

  if (sourceTransactionContainsOpeningBalancesBooking) {
    throw new Error(OPENING_BALANCES_MANAGEMENT_MESSAGE);
  }

  if (
    targetAccount.type === AccountType.EQUITY &&
    targetAccount.equityAccountSubtype === EquityAccountSubtype.OPENING_BALANCES
  ) {
    throw new Error(OPENING_BALANCES_MANAGEMENT_MESSAGE);
  }

  if (!accountBookStartDate) {
    throw new Error(
      "Account book start date is required for date-range validation.",
    );
  }

  const bookingDay = startOfUtcDay(booking.date);
  const accountBookStartDay = startOfUtcDay(accountBookStartDate);
  if (isBefore(bookingDay, accountBookStartDay)) {
    throw new Error(
      `Date cannot be before account book start date (${formatUtcDate(accountBookStartDay)}).`,
    );
  }

  const bookingUnitIdentifier = getBookingUnitIdentifier(booking);
  if (!bookingUnitIdentifier) {
    throw new Error("Source booking unit details are incomplete.");
  }

  if (targetAccount.unit) {
    const targetUnitIdentifier = getAccountUnitIdentifier(targetAccount);
    if (!targetUnitIdentifier) {
      throw new Error("Target account unit details are incomplete.");
    }

    if (bookingUnitIdentifier !== targetUnitIdentifier) {
      throw new Error("Target account must use the same unit as the booking.");
    }
  }

  if (!isBookingValueCompatibleWithAccountType(booking.value, targetAccount)) {
    if (
      targetAccount.type === AccountType.EQUITY &&
      targetAccount.equityAccountSubtype === EquityAccountSubtype.INCOME
    ) {
      throw new Error("Income accounts cannot have debit entries.");
    }

    if (
      targetAccount.type === AccountType.EQUITY &&
      targetAccount.equityAccountSubtype === EquityAccountSubtype.EXPENSE
    ) {
      throw new Error("Expense accounts cannot have credit entries.");
    }
  }
}

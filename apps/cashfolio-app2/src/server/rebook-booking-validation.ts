import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { startOfUtcDay } from "../shared/date";
import {
  getAccountUnitIdentifier,
  getBookingUnitIdentifier,
  isBookingValueCompatibleWithAccountType,
} from "../shared/account-utils";

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
}) {
  const { booking, targetAccount, accountBookStartDate } = args;

  if (!targetAccount.isActive) {
    throw new Error("Target account must be active.");
  }

  if (booking.accountId === targetAccount.id) {
    throw new Error(
      "Target account must be different from the current account.",
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

  if (
    targetAccount.type === AccountType.EQUITY &&
    targetAccount.equityAccountSubtype === EquityAccountSubtype.OPENING_BALANCES
  ) {
    if (!accountBookStartDate) {
      throw new Error(
        "Account book start date is required for opening-balance validation.",
      );
    }

    const openingBalancesBookingDate =
      getOpeningBalancesBookingDate(accountBookStartDate);

    if (!isSameUtcDay(booking.date, openingBalancesBookingDate)) {
      throw new Error(
        `Opening Balances bookings must be dated ${formatUtcDate(openingBalancesBookingDate)}.`,
      );
    }
  }
}

function getOpeningBalancesBookingDate(accountBookStartDate: Date): Date {
  const startDate = startOfUtcDay(accountBookStartDate);
  return new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import {
  getAccountUnitIdentifier,
  getBookingUnitIdentifier,
} from "../shared/account-utils";

export type RebookBookingValidationInput = {
  accountId: string;
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
}) {
  const { booking, targetAccount } = args;

  if (!targetAccount.isActive) {
    throw new Error("Target account must be active.");
  }

  if (booking.accountId === targetAccount.id) {
    throw new Error(
      "Target account must be different from the current account.",
    );
  }

  if (targetAccount.unit) {
    const bookingUnitIdentifier = getBookingUnitIdentifier(booking);
    if (!bookingUnitIdentifier) {
      throw new Error("Source booking unit details are incomplete.");
    }

    const targetUnitIdentifier = getAccountUnitIdentifier(targetAccount);
    if (!targetUnitIdentifier) {
      throw new Error("Target account unit details are incomplete.");
    }

    if (bookingUnitIdentifier !== targetUnitIdentifier) {
      throw new Error("Target account must use the same unit as the booking.");
    }
  }

  if (
    targetAccount.type === AccountType.EQUITY &&
    targetAccount.equityAccountSubtype === EquityAccountSubtype.INCOME &&
    booking.value > 0
  ) {
    throw new Error("Income accounts cannot have debit entries.");
  }

  if (
    targetAccount.type === AccountType.EQUITY &&
    targetAccount.equityAccountSubtype === EquityAccountSubtype.EXPENSE &&
    booking.value < 0
  ) {
    throw new Error("Expense accounts cannot have credit entries.");
  }
}

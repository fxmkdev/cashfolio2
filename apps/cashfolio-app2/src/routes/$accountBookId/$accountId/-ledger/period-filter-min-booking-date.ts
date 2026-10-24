import { AccountType } from "@/.prisma-client/enums";

export function resolvePeriodFilterMinBookingDate(args: {
  accountType: AccountType;
  accountBookMinBookingDate: Date | null;
  firstAccountBookingDate: Date | null;
}): Date | null {
  const { accountType, accountBookMinBookingDate, firstAccountBookingDate } =
    args;

  if (!accountBookMinBookingDate) {
    return null;
  }

  if (accountType === AccountType.BALANCE) {
    if (!firstAccountBookingDate) {
      return accountBookMinBookingDate;
    }
    return firstAccountBookingDate < accountBookMinBookingDate
      ? accountBookMinBookingDate
      : firstAccountBookingDate;
  }

  return accountBookMinBookingDate;
}

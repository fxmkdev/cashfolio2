import { prisma } from "../prisma.server";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { isAfter, startOfDay } from "date-fns";
import { getUnitIdentifier } from "../shared/account-utils";
import {
  formatUtcDate,
  getOpeningBalancesBookingDate,
  isSameUtcDay,
  startOfUtcDay,
} from "../shared/date";
import {
  getBookingUnitFields,
  type BookingUnitFieldsSource,
} from "../shared/booking-unit-fields";
import type { CreateTransactionInput } from "./transactions-types";

export function validateCreateTransaction(input: CreateTransactionInput) {
  const errors: string[] = [];
  const today = startOfDay(new Date());

  if (input.bookings.length < 2) {
    errors.push("At least two bookings are required.");
  }

  for (let i = 0; i < input.bookings.length; i++) {
    const b = input.bookings[i];
    const date = new Date(b.date);
    if (isNaN(date.getTime())) {
      errors.push(`Booking ${i}: invalid date.`);
    } else if (isAfter(startOfDay(date), today)) {
      errors.push(`Booking ${i}: date cannot be in the future.`);
    }

    if (!b.accountId) {
      errors.push(`Booking ${i}: account is required.`);
    }

    if (!b.unit) {
      errors.push(`Booking ${i}: unit is required.`);
    } else if (b.unit === Unit.CURRENCY && !b.currency) {
      errors.push(`Booking ${i}: currency is required.`);
    } else if (b.unit === Unit.CRYPTOCURRENCY && !b.cryptocurrency) {
      errors.push(`Booking ${i}: cryptocurrency is required.`);
    } else if (b.unit === Unit.SECURITY && (!b.symbol || !b.tradeCurrency)) {
      errors.push(
        `Booking ${i}: symbol and trade currency are required for security bookings.`,
      );
    }

    if (b.value === 0) {
      errors.push(`Booking ${i}: value must be non-zero.`);
    }
  }

  if (errors.length === 0 && input.bookings.length >= 2) {
    const unitIdentifiers = new Set(
      input.bookings.map((b) => getUnitIdentifier(b)),
    );
    if (unitIdentifiers.size === 1) {
      const sum = input.bookings.reduce((acc, b) => acc + b.value, 0);
      if (Math.abs(sum) > 0.001) {
        errors.push("The sum of all bookings must be zero.");
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
}

export async function validateAccountTypeBookings(
  bookings: { accountId: string; value: number; date: string | Date }[],
  accountBookId: string,
) {
  const accountIds = bookings.map((b) => b.accountId).filter(Boolean);
  if (accountIds.length === 0) return;

  const [accounts, accountBook] = await Promise.all([
    prisma.account.findMany({
      where: { id: { in: accountIds }, accountBookId },
      select: { id: true, type: true, equityAccountSubtype: true },
    }),
    prisma.accountBook.findUniqueOrThrow({
      where: { id: accountBookId },
      select: { startDate: true },
    }),
  ]);
  const accountMap = new Map(
    accounts.map((account) => [account.id, accountTypeMeta(account)]),
  );
  validateAccountTypeBookingsWithAccounts(bookings, accountMap, {
    accountBookStartDate: accountBook.startDate,
  });
}

export type AccountTypeMeta = {
  id: string;
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
};

export function accountTypeMeta(account: {
  id: string;
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
}): AccountTypeMeta {
  return {
    id: account.id,
    type: account.type,
    equityAccountSubtype: account.equityAccountSubtype,
  };
}

export function validateAccountTypeBookingsWithAccounts(
  bookings: { accountId: string; value: number; date: string | Date }[],
  accountMap: Map<string, AccountTypeMeta>,
  options?: {
    accountBookStartDate?: Date;
  },
) {
  const openingBalancesBookingDate =
    options?.accountBookStartDate != null
      ? getOpeningBalancesBookingDate(options.accountBookStartDate)
      : null;
  const openingBalancesBookingDateLabel =
    openingBalancesBookingDate != null
      ? formatUtcDate(openingBalancesBookingDate)
      : null;

  const errors: string[] = [];
  for (let i = 0; i < bookings.length; i++) {
    const b = bookings[i];
    const account = accountMap.get(b.accountId);
    if (!account) continue;

    if (
      account.type === AccountType.EQUITY &&
      account.equityAccountSubtype === EquityAccountSubtype.INCOME &&
      b.value > 0
    ) {
      errors.push(`Booking ${i}: Income accounts cannot have debit entries.`);
    }

    if (
      account.type === AccountType.EQUITY &&
      account.equityAccountSubtype === EquityAccountSubtype.EXPENSE &&
      b.value < 0
    ) {
      errors.push(`Booking ${i}: Expense accounts cannot have credit entries.`);
    }

    if (
      account.type === AccountType.EQUITY &&
      account.equityAccountSubtype === EquityAccountSubtype.OPENING_BALANCES
    ) {
      if (!openingBalancesBookingDate || !openingBalancesBookingDateLabel) {
        errors.push(
          `Booking ${i}: Account book start date is required for opening-balance validation.`,
        );
        continue;
      }

      const bookingDate = new Date(b.date);
      if (isNaN(bookingDate.getTime())) {
        errors.push(`Booking ${i}: invalid date.`);
        continue;
      }

      const bookingDay = startOfUtcDay(bookingDate);
      if (!isSameUtcDay(bookingDay, openingBalancesBookingDate)) {
        errors.push(
          `Booking ${i}: Opening Balances bookings must be dated ${openingBalancesBookingDateLabel}.`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
}

export function buildTransactionCreateData(input: CreateTransactionInput) {
  return {
    description: input.description,
    accountBookId: input.accountBookId,
    bookings: {
      create: input.bookings.map((booking, sortOrder) => ({
        date: new Date(booking.date),
        description: booking.description,
        account: {
          connect: {
            id_accountBookId: {
              id: booking.accountId,
              accountBookId: input.accountBookId,
            },
          },
        },
        unit: booking.unit,
        currency: booking.currency,
        cryptocurrency: booking.cryptocurrency,
        symbol: booking.symbol,
        tradeCurrency: booking.tradeCurrency,
        value: booking.value,
        sortOrder,
        accountBook: {
          connect: { id: input.accountBookId },
        },
      })),
    },
  };
}

export type SimpleUnitFields = BookingUnitFieldsSource;

export { getBookingUnitFields };

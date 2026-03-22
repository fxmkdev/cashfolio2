import { prisma } from "../prisma.server";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { isAfter, startOfDay } from "date-fns";
import { getUnitIdentifier } from "../shared/account-utils";
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
    } else if (b.unit === Unit.SECURITY && !b.symbol) {
      errors.push(`Booking ${i}: symbol is required.`);
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
  bookings: { accountId: string; value: number }[],
  accountBookId: string,
) {
  const accountIds = bookings.map((b) => b.accountId).filter(Boolean);
  if (accountIds.length === 0) return;

  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds }, accountBookId },
    select: { id: true, type: true, equityAccountSubtype: true },
  });
  const accountMap = new Map(
    accounts.map((account) => [account.id, accountTypeMeta(account)]),
  );
  validateAccountTypeBookingsWithAccounts(bookings, accountMap);
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
  bookings: { accountId: string; value: number }[],
  accountMap: Map<string, AccountTypeMeta>,
) {
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

export type SimpleUnitFields = {
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

export function getBookingUnitFields(account: SimpleUnitFields): {
  unit: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
} {
  if (!account.unit) {
    throw new Error("Current account must define a unit.");
  }

  if (account.unit === Unit.CURRENCY) {
    if (!account.currency)
      throw new Error("Current account currency is missing.");
    return { unit: Unit.CURRENCY, currency: account.currency };
  }

  if (account.unit === Unit.CRYPTOCURRENCY) {
    if (!account.cryptocurrency) {
      throw new Error("Current account cryptocurrency is missing.");
    }
    return {
      unit: Unit.CRYPTOCURRENCY,
      cryptocurrency: account.cryptocurrency,
    };
  }

  if (!account.symbol) {
    throw new Error("Current account symbol is missing.");
  }
  if (!account.tradeCurrency) {
    throw new Error("Current account trade currency is missing.");
  }
  return {
    unit: Unit.SECURITY,
    symbol: account.symbol,
    tradeCurrency: account.tradeCurrency,
  };
}

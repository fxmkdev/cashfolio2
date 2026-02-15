import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { isAfter, startOfDay } from "date-fns";

export type CreateTransactionInput = {
  accountBookId: string;
  description: string;
  bookings: {
    date: string;
    accountId: string;
    description: string;
    unit: Unit;
    currency?: string;
    cryptocurrency?: string;
    symbol?: string;
    tradeCurrency?: string;
    value: number;
  }[];
};

function getUnitIdentifier(booking: {
  unit: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
}): string {
  switch (booking.unit) {
    case Unit.CURRENCY:
      return `currency:${booking.currency}`;
    case Unit.CRYPTOCURRENCY:
      return `crypto:${booking.cryptocurrency}`;
    case Unit.SECURITY:
      return `security:${booking.symbol}`;
  }
}

function validateCreateTransaction(input: CreateTransactionInput) {
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

async function validateAccountTypeBookings(
  bookings: { accountId: string; value: number }[],
  accountBookId: string,
) {
  const accountIds = bookings.map((b) => b.accountId).filter(Boolean);
  if (accountIds.length === 0) return;

  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds }, accountBookId },
    select: { id: true, type: true, equityAccountSubtype: true },
  });
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

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

export const getTransaction = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { transactionId: string; accountBookId: string }) => data,
  )
  .handler(async ({ data }) => {
    const transaction = await prisma.transaction.findUniqueOrThrow({
      where: {
        id_accountBookId: {
          id: data.transactionId,
          accountBookId: data.accountBookId,
        },
      },
      include: {
        bookings: true,
      },
    });

    return {
      id: transaction.id,
      description: transaction.description,
      bookings: transaction.bookings.map((b) => {
        const value = Number(b.value);
        return {
          date: b.date.toISOString(),
          account: b.accountId,
          description: b.description,
          unit: b.unit as Unit,
          currency: b.currency ?? undefined,
          cryptocurrency: b.cryptocurrency ?? undefined,
          symbol: b.symbol ?? undefined,
          tradeCurrency: b.tradeCurrency ?? undefined,
          debit: value > 0 ? value : undefined,
          credit: value < 0 ? -value : undefined,
        };
      }),
    };
  });

export const updateTransaction = createServerFn({ method: "POST" })
  .inputValidator(
    (data: CreateTransactionInput & { transactionId: string }) => data,
  )
  .handler(async ({ data }) => {
    validateCreateTransaction(data);
    await validateAccountTypeBookings(data.bookings, data.accountBookId);

    await prisma.$transaction([
      prisma.booking.deleteMany({
        where: {
          transactionId: data.transactionId,
          accountBookId: data.accountBookId,
        },
      }),
      prisma.transaction.update({
        where: {
          id_accountBookId: {
            id: data.transactionId,
            accountBookId: data.accountBookId,
          },
        },
        data: {
          description: data.description,
          bookings: {
            create: data.bookings.map((b) => ({
              date: new Date(b.date),
              description: b.description,
              account: {
                connect: {
                  id_accountBookId: {
                    id: b.accountId,
                    accountBookId: data.accountBookId,
                  },
                },
              },
              unit: b.unit,
              currency: b.currency,
              cryptocurrency: b.cryptocurrency,
              symbol: b.symbol,
              tradeCurrency: b.tradeCurrency,
              value: b.value,
              accountBook: {
                connect: { id: data.accountBookId },
              },
            })),
          },
        },
      }),
    ]);
  });

export const createTransaction = createServerFn({ method: "POST" })
  .inputValidator((data: CreateTransactionInput) => data)
  .handler(async ({ data }) => {
    validateCreateTransaction(data);
    await validateAccountTypeBookings(data.bookings, data.accountBookId);

    const transaction = await prisma.transaction.create({
      data: {
        description: data.description,
        accountBookId: data.accountBookId,
        bookings: {
          create: data.bookings.map((b) => ({
            date: new Date(b.date),
            description: b.description,
            account: {
              connect: {
                id_accountBookId: {
                  id: b.accountId,
                  accountBookId: data.accountBookId,
                },
              },
            },
            unit: b.unit,
            currency: b.currency,
            cryptocurrency: b.cryptocurrency,
            symbol: b.symbol,
            tradeCurrency: b.tradeCurrency,
            value: b.value,
            accountBook: {
              connect: { id: data.accountBookId },
            },
          })),
        },
      },
    });

    return transaction;
  });

export const deleteTransaction = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { transactionId: string; accountBookId: string }) => data,
  )
  .handler(async ({ data }) => {
    await prisma.transaction.delete({
      where: {
        id_accountBookId: {
          id: data.transactionId,
          accountBookId: data.accountBookId,
        },
      },
    });
  });

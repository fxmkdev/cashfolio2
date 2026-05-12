import { createServerFn } from "@tanstack/react-start";
import { AccountType, EquityAccountSubtype } from "../../.prisma-client/enums";
import { currencies } from "../../currencies";
import { prisma } from "../../prisma.server";
import { assertRecord, requireStringField } from "../input-validation";
import { ensureAuthorizedAccountBookMutation } from "../mutation-guard.server";
import { ensureAuthorizedForAccountBookId } from "../../account-books/functions.server";
import {
  formatUtcDate,
  getOpeningBalancesBookingDate,
  isSameUtcDay,
  normalizeDateInputValue,
  startOfUtcDay,
} from "../../shared/date";
import { invalidatePeriodBaseDataCacheForAccountBook } from "../period/period-base-data-cache";

type AccountBookSettings = {
  id: string;
  name: string;
  referenceCurrency: string;
  startDate: string;
};

type UpdateAccountBookSettingsInput = {
  accountBookId: string;
  name: string;
  referenceCurrency: string;
  startDate: Date | string;
};

type AccountBookSettingsRecord = {
  id: string;
  name: string;
  referenceCurrency: string;
  startDate: Date;
};

function validateAccountBookSettingsInput(data: unknown): {
  accountBookId: string;
} {
  assertRecord(data);
  return {
    accountBookId: requireStringField(
      data,
      "accountBookId",
      "Account book id is required.",
    ),
  };
}

function validateUpdateAccountBookSettingsInput(
  data: unknown,
): UpdateAccountBookSettingsInput {
  assertRecord(data);
  requireStringField(data, "accountBookId", "Account book id is required.");
  requireStringField(data, "name", "Account book name is required.");
  requireStringField(
    data,
    "referenceCurrency",
    "Reference currency is required.",
  );
  if (data.startDate == null) {
    throw new Error("Start date is required.");
  }

  return data as UpdateAccountBookSettingsInput;
}

function toAccountBookSettingsResponse(
  record: AccountBookSettingsRecord,
): AccountBookSettings {
  return {
    id: record.id,
    name: record.name,
    referenceCurrency: record.referenceCurrency.toUpperCase(),
    startDate: startOfUtcDay(record.startDate).toISOString(),
  };
}

function normalizeAccountBookNameOrThrow(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Account book name is required.");
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error("Account book name is required.");
  }

  return normalized;
}

function normalizeReferenceCurrencyOrThrow(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Reference currency is required.");
  }

  const normalized = value.trim().toUpperCase();
  if (normalized.length === 0) {
    throw new Error("Reference currency is required.");
  }

  if (!Object.prototype.hasOwnProperty.call(currencies, normalized)) {
    throw new Error("Reference currency is invalid.");
  }

  return normalized;
}

function normalizeStartDateOrThrow(value: unknown): Date {
  if (value == null) {
    throw new Error("Start date is required.");
  }

  if (typeof value === "string" && value.trim().length === 0) {
    throw new Error("Start date is required.");
  }

  const normalizedInput =
    value instanceof Date || typeof value === "string" ? value : null;
  const parsed = normalizeDateInputValue(normalizedInput);
  if (!parsed) {
    throw new Error("Start date is invalid.");
  }

  const startDate = startOfUtcDay(parsed);
  const today = startOfUtcDay(new Date());
  if (startDate > today) {
    throw new Error("Start date cannot be in the future.");
  }

  return startDate;
}

async function findFirstNonOpeningBookingDate(
  tx: {
    booking: {
      findFirst: (args: {
        where: {
          accountBookId: string;
          transaction: {
            bookings: {
              none: {
                account: {
                  type: AccountType;
                  equityAccountSubtype: EquityAccountSubtype;
                };
              };
            };
          };
        };
        orderBy:
          | { date: "asc" }[]
          | { id: "asc" }[]
          | [{ date: "asc" }, { id: "asc" }];
        select: { date: true };
      }) => Promise<{ date: Date } | null>;
    };
  },
  accountBookId: string,
): Promise<Date | null> {
  const firstNonOpeningBooking = await tx.booking.findFirst({
    where: {
      accountBookId,
      transaction: {
        bookings: {
          none: {
            account: {
              type: AccountType.EQUITY,
              equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
            },
          },
        },
      },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    select: { date: true },
  });

  return firstNonOpeningBooking
    ? startOfUtcDay(firstNonOpeningBooking.date)
    : null;
}

function assertStartDateNotAfterFirstNonOpeningBooking(args: {
  startDate: Date;
  firstNonOpeningBookingDay: Date | null;
}) {
  if (!args.firstNonOpeningBookingDay) {
    return;
  }

  if (args.startDate > args.firstNonOpeningBookingDay) {
    throw new Error(
      `Start date cannot be after first non-opening booking date (${formatUtcDate(args.firstNonOpeningBookingDay)}).`,
    );
  }
}

async function migrateOpeningTransactionsToDate(
  tx: {
    transaction: {
      findMany: (args: {
        where: {
          accountBookId: string;
          bookings: {
            some: {
              account: {
                type: AccountType;
                equityAccountSubtype: EquityAccountSubtype;
              };
            };
          };
        };
        select: { id: true };
      }) => Promise<{ id: string }[]>;
    };
    booking: {
      updateMany: (args: {
        where: {
          accountBookId: string;
          transactionId: { in: string[] };
        };
        data: { date: Date };
      }) => Promise<unknown>;
    };
  },
  args: {
    accountBookId: string;
    startDate: Date;
  },
) {
  const openingBookingDate = getOpeningBalancesBookingDate(args.startDate);
  const openingTransactions = await tx.transaction.findMany({
    where: {
      accountBookId: args.accountBookId,
      bookings: {
        some: {
          account: {
            type: AccountType.EQUITY,
            equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
          },
        },
      },
    },
    select: { id: true },
  });

  if (openingTransactions.length === 0) {
    return;
  }

  await tx.booking.updateMany({
    where: {
      accountBookId: args.accountBookId,
      transactionId: {
        in: openingTransactions.map((transaction) => transaction.id),
      },
    },
    data: {
      date: openingBookingDate,
    },
  });
}

export const getAccountBookSettings = createServerFn({ method: "GET" })
  .inputValidator(validateAccountBookSettingsInput)
  .handler(async ({ data }): Promise<AccountBookSettings> => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);

    const accountBook = await prisma.accountBook.findUniqueOrThrow({
      where: { id: data.accountBookId },
      select: {
        id: true,
        name: true,
        referenceCurrency: true,
        startDate: true,
      },
    });

    return toAccountBookSettingsResponse(accountBook);
  });

export const updateAccountBookSettings = createServerFn({ method: "POST" })
  .inputValidator(validateUpdateAccountBookSettingsInput)
  .handler(async ({ data }): Promise<AccountBookSettings> => {
    await ensureAuthorizedAccountBookMutation(data.accountBookId);

    const name = normalizeAccountBookNameOrThrow(data.name);
    const referenceCurrency = normalizeReferenceCurrencyOrThrow(
      data.referenceCurrency,
    );
    const startDate = normalizeStartDateOrThrow(data.startDate);

    const { updated, referenceCurrencyChanged, startDateChanged } =
      await prisma.$transaction(async (tx) => {
        const currentAccountBook = await tx.accountBook.findUniqueOrThrow({
          where: { id: data.accountBookId },
          select: {
            id: true,
            referenceCurrency: true,
            startDate: true,
          },
        });

        const referenceCurrencyChanged =
          currentAccountBook.referenceCurrency.toUpperCase() !==
          referenceCurrency;
        const startDateChanged = !isSameUtcDay(
          currentAccountBook.startDate,
          startDate,
        );

        if (startDateChanged) {
          const firstNonOpeningBookingDay =
            await findFirstNonOpeningBookingDate(tx, data.accountBookId);
          assertStartDateNotAfterFirstNonOpeningBooking({
            startDate,
            firstNonOpeningBookingDay,
          });
          await migrateOpeningTransactionsToDate(tx, {
            accountBookId: data.accountBookId,
            startDate,
          });
        }

        const updated = await tx.accountBook.update({
          where: { id: data.accountBookId },
          data: {
            name,
            referenceCurrency,
            startDate,
          },
          select: {
            id: true,
            name: true,
            referenceCurrency: true,
            startDate: true,
          },
        });

        return {
          updated,
          referenceCurrencyChanged,
          startDateChanged,
        };
      });

    if (referenceCurrencyChanged || startDateChanged) {
      await invalidatePeriodBaseDataCacheForAccountBook(data.accountBookId);
    }

    return toAccountBookSettingsResponse(updated);
  });

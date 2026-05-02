import { createServerFn } from "@tanstack/react-start";
import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { currencies } from "../currencies";
import { prisma } from "../prisma.server";
import { ensureSameOriginRequestFromServerContext } from "../security/same-origin.server";
import {
  formatUtcDate,
  getOpeningBalancesBookingDate,
  isSameUtcDay,
  normalizeDateInputValue,
  startOfUtcDay,
} from "../shared/date";
import { invalidatePeriodBaseDataCacheForAccountBook } from "./period-base-data-cache";

type AccountBookSettings = {
  id: string;
  name: string;
  referenceCurrency: string;
  startDate: Date;
};

type UpdateAccountBookSettingsInput = {
  accountBookId: string;
  name: string;
  referenceCurrency: string;
  startDate: Date | string;
};

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

  if (!(normalized in currencies)) {
    throw new Error("Reference currency is invalid.");
  }

  return normalized;
}

function normalizeStartDateOrThrow(value: unknown): Date {
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

export const getAccountBookSettings = createServerFn({ method: "GET" })
  .inputValidator((data: { accountBookId: string }) => data)
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

    return {
      id: accountBook.id,
      name: accountBook.name,
      referenceCurrency: accountBook.referenceCurrency.toUpperCase(),
      startDate: startOfUtcDay(accountBook.startDate),
    };
  });

export const updateAccountBookSettings = createServerFn({ method: "POST" })
  .inputValidator((data: UpdateAccountBookSettingsInput) => data)
  .handler(async ({ data }): Promise<AccountBookSettings> => {
    ensureSameOriginRequestFromServerContext();
    await ensureAuthorizedForAccountBookId(data.accountBookId);

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

        const firstNonOpeningBooking = await tx.booking.findFirst({
          where: {
            accountBookId: data.accountBookId,
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

        if (firstNonOpeningBooking) {
          const firstNonOpeningBookingDay = startOfUtcDay(
            firstNonOpeningBooking.date,
          );
          if (startDate > firstNonOpeningBookingDay) {
            throw new Error(
              `Start date cannot be after first non-opening booking date (${formatUtcDate(firstNonOpeningBookingDay)}).`,
            );
          }
        }

        const referenceCurrencyChanged =
          currentAccountBook.referenceCurrency.toUpperCase() !==
          referenceCurrency;
        const startDateChanged = !isSameUtcDay(
          currentAccountBook.startDate,
          startDate,
        );

        if (startDateChanged) {
          const openingBookingDate = getOpeningBalancesBookingDate(startDate);
          const openingTransactions = await tx.transaction.findMany({
            where: {
              accountBookId: data.accountBookId,
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

          if (openingTransactions.length > 0) {
            await tx.booking.updateMany({
              where: {
                accountBookId: data.accountBookId,
                transactionId: {
                  in: openingTransactions.map((transaction) => transaction.id),
                },
              },
              data: {
                date: openingBookingDate,
              },
            });
          }
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

    return {
      id: updated.id,
      name: updated.name,
      referenceCurrency: updated.referenceCurrency.toUpperCase(),
      startDate: startOfUtcDay(updated.startDate),
    };
  });

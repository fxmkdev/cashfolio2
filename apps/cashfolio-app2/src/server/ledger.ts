import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { startOfUtcDay } from "../shared/date";
import {
  getExplicitPeriodDateRange,
  parseExplicitPeriodSelectionFromUnknown,
  type ExplicitPeriodSelection,
} from "../shared/period";
import { createGroupPathSegmentsResolver } from "./accounts-helpers";
import { convertBookingValueToReference } from "./period-conversion";

const LEDGER_REFERENCE_CONVERSION_CONCURRENCY = 12;

export const getAccountForLedger = createServerFn({ method: "GET" })
  .inputValidator((data: { accountId: string; accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const account = await prisma.account.findUniqueOrThrow({
      where: {
        id_accountBookId: {
          id: data.accountId,
          accountBookId: data.accountBookId,
        },
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        type: true,
        equityAccountSubtype: true,
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
        groupId: true,
      },
    });

    const allGroups = await prisma.accountGroup.findMany({
      where: { accountBookId: data.accountBookId },
      select: { id: true, name: true, parentGroupId: true },
    });
    const resolveGroupPathSegments = createGroupPathSegmentsResolver(allGroups);

    const { groupId, ...rest } = account;
    return {
      ...rest,
      groupPathSegments: groupId ? resolveGroupPathSegments(groupId) : [],
    };
  });

export const getLedgerData = createServerFn({ method: "GET" })
  .inputValidator(
    (data: {
      accountId: string;
      accountBookId: string;
      period?: unknown;
      includeReferenceValues?: unknown;
    }) => ({
      accountId: data.accountId,
      accountBookId: data.accountBookId,
      period: parseExplicitLedgerPeriodSelection(data.period),
      includeReferenceValues: toBoolean(data.includeReferenceValues),
    }),
  )
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const periodRange = data.period
      ? getExplicitPeriodDateRange(data.period)
      : null;
    const [bookings, referenceCurrency] = await Promise.all([
      prisma.booking.findMany({
        where: {
          accountId: data.accountId,
          accountBookId: data.accountBookId,
          ...(periodRange
            ? {
                date: {
                  gte: periodRange.from,
                  lt: periodRange.toExclusive,
                },
              }
            : {}),
        },
        orderBy: [
          { date: "asc" },
          { transaction: { createdAt: "asc" } },
          { id: "asc" },
        ],
        select: {
          id: true,
          date: true,
          description: true,
          value: true,
          unit: true,
          currency: true,
          cryptocurrency: true,
          symbol: true,
          tradeCurrency: true,
          transactionId: true,
          transaction: {
            select: {
              description: true,
              bookings: {
                where: {
                  accountId: { not: data.accountId },
                },
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                select: {
                  account: {
                    select: { id: true, name: true },
                  },
                },
              },
            },
          },
        },
      }),
      data.includeReferenceValues
        ? prisma.accountBook
            .findUniqueOrThrow({
              where: { id: data.accountBookId },
              select: { referenceCurrency: true },
            })
            .then((accountBook) => accountBook.referenceCurrency.toUpperCase())
        : Promise.resolve<string | null>(null),
    ]);

    let convertedValuesInReferenceCurrency: Array<number | null> | null = null;
    if (data.includeReferenceValues && referenceCurrency) {
      const exchangeRateByKey = new Map<string, Promise<number | null>>();
      convertedValuesInReferenceCurrency = await mapWithConcurrencyLimit(
        bookings,
        LEDGER_REFERENCE_CONVERSION_CONCURRENCY,
        (booking) =>
          booking.unit
            ? convertBookingValueToReference({
                value: Number(booking.value),
                unit: booking.unit,
                currency: booking.currency,
                cryptocurrency: booking.cryptocurrency,
                symbol: booking.symbol,
                tradeCurrency: booking.tradeCurrency,
                date: booking.date,
                referenceCurrency,
                exchangeRateByKey,
              })
            : Promise.resolve<number | null>(null),
      );
    }

    return {
      referenceCurrency,
      bookings: bookings.map((b, index) => ({
        id: b.id,
        date: b.date,
        description: b.description,
        value: Number(b.value),
        valueInReferenceCurrency:
          convertedValuesInReferenceCurrency?.[index] ?? null,
        unit: b.unit,
        currency: b.currency,
        cryptocurrency: b.cryptocurrency,
        symbol: b.symbol,
        tradeCurrency: b.tradeCurrency,
        transactionId: b.transactionId,
        transactionDescription: b.transaction.description,
        counterpartyAccounts: [
          ...new Map(
            b.transaction.bookings.map((sb) => [sb.account.id, sb.account]),
          ).values(),
        ],
      })),
    };
  });

export const getLedgerPeriodBounds = createServerFn({ method: "GET" })
  .inputValidator((data: { accountId: string; accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const accountBook = await prisma.accountBook.findUniqueOrThrow({
      where: { id: data.accountBookId },
      select: { startDate: true },
    });
    const currentDay = startOfUtcDay(new Date());
    const accountBookStartDate = startOfUtcDay(accountBook.startDate);
    const openingBalancesBookingDate = new Date(
      accountBookStartDate.getTime() - 24 * 60 * 60 * 1000,
    );

    return {
      minBookingDate: accountBookStartDate.toISOString(),
      maxDate: currentDay.toISOString(),
      openingBalancesBookingDate: openingBalancesBookingDate.toISOString(),
    };
  });

function parseExplicitLedgerPeriodSelection(
  value: unknown,
): ExplicitPeriodSelection | undefined {
  return parseExplicitPeriodSelectionFromUnknown(value);
}

function toBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

async function mapWithConcurrencyLimit<TInput, TOutput>(
  items: readonly TInput[],
  concurrencyLimit: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<TOutput>(items.length);
  const workerCount = Math.min(Math.max(1, concurrencyLimit), items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
}

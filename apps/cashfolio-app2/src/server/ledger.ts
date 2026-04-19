import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import {
  getExplicitPeriodDateRange,
  normalizeExplicitPeriodValue,
  parseExplicitPeriodSelection,
  type ExplicitPeriodSelection,
} from "../shared/period";
import { createGroupPathSegmentsResolver } from "./accounts-helpers";
import { convertBookingValueToReference } from "./period-conversion";

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
      includeReferenceValues: data.includeReferenceValues === true,
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

    const exchangeRateByKey = new Map<string, Promise<number | null>>();
    const convertedValuesInReferenceCurrency =
      data.includeReferenceValues && referenceCurrency
        ? await Promise.all(
            bookings.map((booking) =>
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
            ),
          )
        : null;

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
    const minBookingDateAggregate = await prisma.booking.aggregate({
      where: {
        accountId: data.accountId,
        accountBookId: data.accountBookId,
      },
      _min: { date: true },
    });
    const currentDay = startOfUtcDay(new Date());

    return {
      minBookingDate: minBookingDateAggregate._min.date?.toISOString() ?? null,
      maxDate: currentDay.toISOString(),
    };
  });

function parseExplicitLedgerPeriodSelection(
  value: unknown,
): ExplicitPeriodSelection | undefined {
  const normalizedPeriodValue = normalizeExplicitPeriodValue(value);
  if (!normalizedPeriodValue) {
    return undefined;
  }

  return parseExplicitPeriodSelection(normalizedPeriodValue) ?? undefined;
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

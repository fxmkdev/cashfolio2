import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
import { getOpeningBalancesBookingDate, startOfUtcDay } from "../shared/date";
import {
  getExplicitPeriodDateRange,
  parseExplicitPeriodSelectionFromUnknown,
  type ExplicitPeriodSelection,
} from "../shared/period";
import { toMoneyNumber } from "../shared/money";
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
      includeFirstBookingDate?: unknown;
    }) => ({
      accountId: data.accountId,
      accountBookId: data.accountBookId,
      period: parseExplicitLedgerPeriodSelection(data.period),
      includeReferenceValues: toBoolean(data.includeReferenceValues),
      includeFirstBookingDate: toBoolean(data.includeFirstBookingDate),
    }),
  )
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const periodRange = data.period
      ? getExplicitPeriodDateRange(data.period)
      : null;
    const firstBookingPromise = data.includeFirstBookingDate
      ? prisma.booking.findFirst({
          where: {
            accountId: data.accountId,
            accountBookId: data.accountBookId,
          },
          orderBy: [{ date: "asc" }, { id: "asc" }],
          select: {
            date: true,
          },
        })
      : Promise.resolve<{
          date: Date;
        } | null>(null);
    const carryOverMetadataPromise = periodRange
      ? prisma.booking
          .aggregate({
            where: {
              accountId: data.accountId,
              accountBookId: data.accountBookId,
              date: { lt: periodRange.from },
            },
            _sum: { value: true },
            _count: { _all: true },
          })
          .then((aggregateResult) => ({
            balanceBeforePeriod: toMoneyNumber(aggregateResult._sum.value ?? 0),
            hasBookingsBeforePeriod: aggregateResult._count._all > 0,
          }))
      : Promise.resolve({
          balanceBeforePeriod: 0,
          hasBookingsBeforePeriod: false,
        });

    const [bookings, referenceCurrency, carryOverMetadata, firstBooking] =
      await Promise.all([
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
                  orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                  select: {
                    account: {
                      select: {
                        id: true,
                        name: true,
                        type: true,
                        equityAccountSubtype: true,
                      },
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
              .then((accountBook) =>
                accountBook.referenceCurrency.toUpperCase(),
              )
          : Promise.resolve<string | null>(null),
        carryOverMetadataPromise,
        firstBookingPromise,
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
                value: toMoneyNumber(booking.value),
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

    type LedgerBookingRecord = (typeof bookings)[number];
    const mapLedgerBooking = (
      booking: LedgerBookingRecord,
      valueInReferenceCurrency: number | null,
    ) => ({
      id: booking.id,
      date: booking.date,
      description: booking.description,
      value: toMoneyNumber(booking.value),
      valueInReferenceCurrency,
      unit: booking.unit,
      currency: booking.currency,
      cryptocurrency: booking.cryptocurrency,
      symbol: booking.symbol,
      tradeCurrency: booking.tradeCurrency,
      transactionId: booking.transactionId,
      transactionDescription: booking.transaction.description,
      counterpartyAccounts: [
        ...new Map(
          booking.transaction.bookings
            .filter((sb) => sb.account.id !== data.accountId)
            .map((sb) => [
              sb.account.id,
              { id: sb.account.id, name: sb.account.name },
            ]),
        ).values(),
      ],
      isOpeningBalancesTransaction: booking.transaction.bookings.some(
        (sb) =>
          sb.account.type === AccountType.EQUITY &&
          sb.account.equityAccountSubtype ===
            EquityAccountSubtype.OPENING_BALANCES,
      ),
    });

    return {
      referenceCurrency,
      bookings: bookings.map((booking, index) =>
        mapLedgerBooking(
          booking,
          convertedValuesInReferenceCurrency?.[index] ?? null,
        ),
      ),
      firstBookingDate: firstBooking?.date.toISOString() ?? null,
      balanceBeforePeriod: carryOverMetadata.balanceBeforePeriod,
      hasBookingsBeforePeriod: carryOverMetadata.hasBookingsBeforePeriod,
    };
  });

export const getLedgerPeriodBounds = createServerFn({ method: "GET" })
  .inputValidator((data: { accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const accountBook = await prisma.accountBook.findUniqueOrThrow({
      where: { id: data.accountBookId },
      select: { startDate: true },
    });
    const currentDay = startOfUtcDay(new Date());
    const accountBookStartDate = startOfUtcDay(accountBook.startDate);
    const openingBalancesBookingDate =
      getOpeningBalancesBookingDate(accountBookStartDate);

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

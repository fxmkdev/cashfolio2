import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import {
  parseExplicitMonthPeriod,
  parseExplicitYearPeriod,
} from "../shared/period";
import { createGroupPathSegmentsResolver } from "./accounts-helpers";

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
    (data: { accountId: string; accountBookId: string; period?: unknown }) => ({
      accountId: data.accountId,
      accountBookId: data.accountBookId,
      period: normalizeLedgerPeriodValue(data.period),
    }),
  )
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const periodRange = data.period ? toPeriodDateRange(data.period) : null;
    const bookings = await prisma.booking.findMany({
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
    });

    return bookings.map((b) => ({
      id: b.id,
      date: b.date,
      description: b.description,
      value: Number(b.value),
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
    }));
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

function normalizeLedgerPeriodValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  const explicitMonth = parseExplicitMonthPeriod(normalized);
  if (explicitMonth) {
    return explicitMonth.value;
  }

  const explicitYear = parseExplicitYearPeriod(normalized);
  if (explicitYear) {
    return explicitYear.value;
  }

  return undefined;
}

function toPeriodDateRange(periodValue: string): {
  from: Date;
  toExclusive: Date;
} {
  const explicitMonth = parseExplicitMonthPeriod(periodValue);
  if (explicitMonth) {
    return {
      from: new Date(Date.UTC(explicitMonth.year, explicitMonth.month, 1)),
      toExclusive: new Date(
        Date.UTC(explicitMonth.year, explicitMonth.month + 1, 1),
      ),
    };
  }

  const explicitYear = parseExplicitYearPeriod(periodValue);
  if (!explicitYear) {
    throw new Error("Unsupported ledger period");
  }

  return {
    from: new Date(Date.UTC(explicitYear.year, 0, 1)),
    toExclusive: new Date(Date.UTC(explicitYear.year + 1, 0, 1)),
  };
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

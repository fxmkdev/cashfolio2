import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { prisma } from "../prisma.server";
import { toMoneyNumber } from "../shared/money";
import { convertBookingValueToReference } from "./period-conversion";
import {
  accumulateConvertedEquityBooking,
  createPeriodOverviewEquityAggregation,
} from "./period-overview-aggregation";

const EQUITY_BOOKINGS_PAGE_SIZE = 1_000;

type ResolvedEquityAccount = {
  id: string;
  name: string;
  groupId: string | null;
  equityAccountSubtype: EquityAccountSubtype | null;
};

export type ConvertedExplicitEquityBooking = {
  bookingId: string;
  transactionId: string;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  convertedValue: number;
};

function resolveEquityBookingAccountId(booking: {
  accountId?: string;
  account?: {
    id?: string;
  };
}) {
  const accountId = booking.accountId ?? booking.account?.id;
  if (!accountId) {
    throw new Error(
      "Equity booking invariant violated: booking is missing accountId.",
    );
  }

  return accountId;
}

function resolveEquityBookingAccount(
  booking: {
    accountId?: string;
    account?: {
      id?: string;
      name?: string;
      groupId?: string | null;
      equityAccountSubtype?: EquityAccountSubtype | null;
    };
  },
  equityAccountById: Map<string, ResolvedEquityAccount>,
) {
  const bookingAccountId = resolveEquityBookingAccountId(booking);
  const mappedAccount = equityAccountById.get(bookingAccountId);
  if (mappedAccount) {
    return mappedAccount;
  }

  const fallbackAccount = booking.account;
  if (
    fallbackAccount &&
    fallbackAccount.id &&
    fallbackAccount.name &&
    (fallbackAccount.equityAccountSubtype === EquityAccountSubtype.INCOME ||
      fallbackAccount.equityAccountSubtype === EquityAccountSubtype.EXPENSE ||
      fallbackAccount.equityAccountSubtype === EquityAccountSubtype.GAIN_LOSS)
  ) {
    return {
      id: fallbackAccount.id,
      name: fallbackAccount.name,
      groupId: fallbackAccount.groupId ?? null,
      equityAccountSubtype: fallbackAccount.equityAccountSubtype,
    };
  }

  throw new Error(
    `Equity booking invariant violated for account ${bookingAccountId}: missing preloaded equity account metadata.`,
  );
}

export async function loadPeriodEquityBookings(args: {
  accountBookId: string;
  queryStart: Date;
  queryEndExclusive: Date;
  referenceCurrency: string;
  exchangeRateByKey: Map<string, Promise<number | null>>;
  equityAccountIds: string[];
  equityAccountById: Map<string, ResolvedEquityAccount>;
}) {
  const usesPreloadedEquityAccountFilter = args.equityAccountIds.length > 0;
  let nextBookingIdCursor: string | undefined;
  let bookingsCount = 0;
  let convertedBookingsCount = 0;
  let skippedBookingsCount = 0;
  const equityAggregation = createPeriodOverviewEquityAggregation();
  const explicitTransactionIds = new Set<string>();
  const explicitConvertedBookings: ConvertedExplicitEquityBooking[] = [];

  while (true) {
    const bookingsPage = await prisma.booking.findMany({
      where: {
        accountBookId: args.accountBookId,
        date: {
          gte: args.queryStart,
          lt: args.queryEndExclusive,
        },
        ...(usesPreloadedEquityAccountFilter
          ? {
              accountId: {
                in: args.equityAccountIds,
              },
            }
          : {
              account: {
                type: AccountType.EQUITY,
                equityAccountSubtype: {
                  in: [
                    EquityAccountSubtype.INCOME,
                    EquityAccountSubtype.EXPENSE,
                    EquityAccountSubtype.GAIN_LOSS,
                  ],
                },
              },
            }),
      },
      orderBy: { id: "asc" },
      take: EQUITY_BOOKINGS_PAGE_SIZE,
      ...(nextBookingIdCursor
        ? {
            cursor: {
              id_accountBookId: {
                id: nextBookingIdCursor,
                accountBookId: args.accountBookId,
              },
            },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        accountId: true,
        transactionId: true,
        date: true,
        value: true,
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
        ...(usesPreloadedEquityAccountFilter
          ? {}
          : {
              account: {
                select: {
                  id: true,
                  name: true,
                  groupId: true,
                  equityAccountSubtype: true,
                },
              },
            }),
      },
    });

    if (bookingsPage.length === 0) {
      break;
    }

    bookingsCount += bookingsPage.length;
    nextBookingIdCursor = bookingsPage[bookingsPage.length - 1].id;

    const conversionTasks = bookingsPage.map((booking) => ({
      booking,
      convertedValuePromise: convertBookingValueToReference({
        value: toMoneyNumber(booking.value),
        unit: booking.unit,
        currency: booking.currency,
        cryptocurrency: booking.cryptocurrency,
        symbol: booking.symbol,
        tradeCurrency: booking.tradeCurrency,
        date: booking.date,
        referenceCurrency: args.referenceCurrency,
        exchangeRateByKey: args.exchangeRateByKey,
      }),
    }));

    const convertedValues = await Promise.all(
      conversionTasks.map((task) => task.convertedValuePromise),
    );
    for (let index = 0; index < conversionTasks.length; index += 1) {
      const booking = conversionTasks[index]!.booking;
      const convertedValue = convertedValues[index];

      if (convertedValue == null) {
        skippedBookingsCount += 1;
        continue;
      }

      const equityAccount = resolveEquityBookingAccount(
        booking,
        args.equityAccountById,
      );

      convertedBookingsCount += 1;
      accumulateConvertedEquityBooking({
        booking: {
          account: {
            id: equityAccount.id,
            name: equityAccount.name,
            groupId: equityAccount.groupId,
            equityAccountSubtype: equityAccount.equityAccountSubtype,
          },
        },
        convertedValue,
        aggregation: equityAggregation,
      });

      if (
        equityAccount.equityAccountSubtype === EquityAccountSubtype.GAIN_LOSS
      ) {
        explicitTransactionIds.add(booking.transactionId);
        explicitConvertedBookings.push({
          bookingId: booking.id,
          transactionId: booking.transactionId,
          unit: booking.unit,
          currency: booking.currency,
          cryptocurrency: booking.cryptocurrency,
          symbol: booking.symbol,
          tradeCurrency: booking.tradeCurrency,
          convertedValue,
        });
      }
    }

    if (bookingsPage.length < EQUITY_BOOKINGS_PAGE_SIZE) {
      break;
    }
  }

  return {
    equityAggregation,
    explicitTransactionIds: Array.from(explicitTransactionIds),
    explicitConvertedBookings,
    bookingsCount,
    convertedBookingsCount,
    skippedBookingsCount,
  };
}

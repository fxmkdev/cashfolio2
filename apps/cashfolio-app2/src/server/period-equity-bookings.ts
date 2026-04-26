import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { prisma } from "../prisma.server";
import {
  accumulateGainLossContribution,
  resolveExplicitCounterpartNonEquityAccounts,
  type ExplicitCounterpartAccount,
  type GainLossContributionAccumulator,
} from "./period-gains-losses-contributions";
import {
  accumulateConvertedEquityBooking,
  type PeriodOverviewEquityAggregation,
} from "./period-overview-aggregation";

export async function processPeriodEquityBookings(args: {
  accountBookId: string;
  periodStart: Date;
  periodEndExclusive: Date;
  pageSize: number;
  equityAggregation: PeriodOverviewEquityAggregation;
  gainsLossesContributionByKey: Map<string, GainLossContributionAccumulator>;
  convertBookingToReference: (booking: {
    value: number;
    unit: Unit;
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
    date: Date;
  }) => Promise<number | null>;
}) {
  let bookingsCount = 0;
  let convertedCount = 0;
  let skippedCount = 0;
  let nextBookingIdCursor: string | undefined;

  const explicitCounterpartAccountByTransactionId = new Map<
    string,
    ExplicitCounterpartAccount
  >();

  while (true) {
    const bookingsPage = await prisma.booking.findMany({
      where: {
        accountBookId: args.accountBookId,
        date: {
          gte: args.periodStart,
          lt: args.periodEndExclusive,
        },
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
      },
      orderBy: { id: "asc" },
      take: args.pageSize,
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
        transactionId: true,
        date: true,
        value: true,
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
        account: {
          select: {
            id: true,
            name: true,
            groupId: true,
            equityAccountSubtype: true,
          },
        },
      },
    });

    if (bookingsPage.length === 0) {
      break;
    }

    bookingsCount += bookingsPage.length;
    nextBookingIdCursor = bookingsPage[bookingsPage.length - 1].id;

    const convertedValues = await Promise.all(
      bookingsPage.map((booking) =>
        args.convertBookingToReference({
          value: Number(booking.value),
          unit: booking.unit,
          currency: booking.currency,
          cryptocurrency: booking.cryptocurrency,
          symbol: booking.symbol,
          tradeCurrency: booking.tradeCurrency,
          date: booking.date,
        }),
      ),
    );

    const explicitBookingsForCounterpartResolution: Array<{
      transactionId: string;
    }> = [];
    for (let index = 0; index < bookingsPage.length; index += 1) {
      const booking = bookingsPage[index]!;
      const convertedValue = convertedValues[index];
      if (
        convertedValue != null &&
        booking.account.equityAccountSubtype === EquityAccountSubtype.GAIN_LOSS
      ) {
        explicitBookingsForCounterpartResolution.push({
          transactionId: booking.transactionId,
        });
      }
    }

    if (explicitBookingsForCounterpartResolution.length > 0) {
      await resolveExplicitCounterpartNonEquityAccounts({
        accountBookId: args.accountBookId,
        explicitBookings: explicitBookingsForCounterpartResolution,
        byTransactionId: explicitCounterpartAccountByTransactionId,
      });
    }

    for (let index = 0; index < bookingsPage.length; index += 1) {
      const booking = bookingsPage[index]!;
      const convertedValue = convertedValues[index];

      if (convertedValue == null) {
        skippedCount += 1;
        continue;
      }

      convertedCount += 1;
      accumulateConvertedEquityBooking({
        booking,
        convertedValue,
        aggregation: args.equityAggregation,
      });

      if (
        booking.account.equityAccountSubtype !== EquityAccountSubtype.GAIN_LOSS
      ) {
        continue;
      }

      const counterpartAccount = explicitCounterpartAccountByTransactionId.get(
        booking.transactionId,
      );
      if (!counterpartAccount) {
        throw new Error(
          `Explicit gain/loss booking invariant violated for booking ${booking.id} in transaction ${booking.transactionId}: missing resolved counterpart account.`,
        );
      }

      accumulateGainLossContribution({
        byKey: args.gainsLossesContributionByKey,
        sourceKind: "EXPLICIT",
        accountId: counterpartAccount.id,
        accountName: counterpartAccount.name,
        unit: booking.unit,
        currency: booking.currency,
        cryptocurrency: booking.cryptocurrency,
        symbol: booking.symbol,
        tradeCurrency: booking.tradeCurrency,
        realizedGainLoss: -convertedValue,
        unrealizedGainLoss: 0,
      });
    }

    if (bookingsPage.length < args.pageSize) {
      break;
    }
  }

  return {
    bookingsCount,
    convertedCount,
    skippedCount,
  };
}

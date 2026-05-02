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
  const trackedEquitySubtypes: EquityAccountSubtype[] = [
    EquityAccountSubtype.INCOME,
    EquityAccountSubtype.EXPENSE,
    EquityAccountSubtype.GAIN_LOSS,
  ];
  let bookingsCount = 0;
  let convertedCount = 0;
  let skippedCount = 0;
  let nextBookingIdCursor: string | undefined;

  const explicitCounterpartAccountByTransactionId = new Map<
    string,
    ExplicitCounterpartAccount
  >();
  const explicitTransactionIdSet = new Set<string>();
  const explicitContributionCandidates: Array<{
    booking: {
      id: string;
      transactionId: string;
      unit: Unit;
      currency: string | null;
      cryptocurrency: string | null;
      symbol: string | null;
      tradeCurrency: string | null;
    };
    convertedValue: number;
  }> = [];

  const equityAccounts = await prisma.account.findMany({
    where: {
      accountBookId: args.accountBookId,
      type: AccountType.EQUITY,
      equityAccountSubtype: {
        in: trackedEquitySubtypes,
      },
    },
    select: {
      id: true,
      name: true,
      groupId: true,
      equityAccountSubtype: true,
    },
  });
  const equityAccountById = new Map(
    equityAccounts.map((account) => [account.id, account]),
  );
  const equityAccountIds = equityAccounts.map((account) => account.id);

  while (true) {
    const bookingsPage = await prisma.booking.findMany({
      where: {
        accountBookId: args.accountBookId,
        ...(equityAccountIds.length > 0
          ? {
              accountId: {
                in: equityAccountIds,
              },
            }
          : {
              account: {
                type: AccountType.EQUITY,
                equityAccountSubtype: {
                  in: trackedEquitySubtypes,
                },
              },
            }),
        date: {
          gte: args.periodStart,
          lt: args.periodEndExclusive,
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
        accountId: true,
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

    for (let index = 0; index < bookingsPage.length; index += 1) {
      const booking = bookingsPage[index]!;
      const convertedValue = convertedValues[index];

      if (convertedValue == null) {
        skippedCount += 1;
        continue;
      }

      convertedCount += 1;
      const bookingAccount =
        booking.account ?? equityAccountById.get(booking.accountId);
      if (!bookingAccount) {
        throw new Error(
          `Equity booking invariant violated for account ${booking.accountId}: missing preloaded equity account metadata.`,
        );
      }
      accumulateConvertedEquityBooking({
        booking: {
          account: bookingAccount,
        },
        convertedValue,
        aggregation: args.equityAggregation,
      });

      if (
        bookingAccount.equityAccountSubtype !== EquityAccountSubtype.GAIN_LOSS
      ) {
        continue;
      }

      explicitTransactionIdSet.add(booking.transactionId);
      explicitContributionCandidates.push({
        booking: {
          id: booking.id,
          transactionId: booking.transactionId,
          unit: booking.unit,
          currency: booking.currency,
          cryptocurrency: booking.cryptocurrency,
          symbol: booking.symbol,
          tradeCurrency: booking.tradeCurrency,
        },
        convertedValue,
      });
    }

    if (bookingsPage.length < args.pageSize) {
      break;
    }
  }

  if (explicitTransactionIdSet.size > 0) {
    await resolveExplicitCounterpartNonEquityAccounts({
      accountBookId: args.accountBookId,
      explicitTransactionIds: Array.from(explicitTransactionIdSet),
      byTransactionId: explicitCounterpartAccountByTransactionId,
    });
  }

  for (const candidate of explicitContributionCandidates) {
    const counterpartAccount = explicitCounterpartAccountByTransactionId.get(
      candidate.booking.transactionId,
    );
    if (!counterpartAccount) {
      throw new Error(
        `Explicit gain/loss booking invariant violated for booking ${candidate.booking.id} in transaction ${candidate.booking.transactionId}: missing resolved counterpart account.`,
      );
    }

    accumulateGainLossContribution({
      byKey: args.gainsLossesContributionByKey,
      sourceKind: "EXPLICIT",
      accountId: counterpartAccount.id,
      accountName: counterpartAccount.name,
      unit: candidate.booking.unit,
      currency: candidate.booking.currency,
      cryptocurrency: candidate.booking.cryptocurrency,
      symbol: candidate.booking.symbol,
      tradeCurrency: candidate.booking.tradeCurrency,
      realizedGainLoss: -candidate.convertedValue,
      unrealizedGainLoss: 0,
    });
  }

  return {
    bookingsCount,
    convertedCount,
    skippedCount,
  };
}

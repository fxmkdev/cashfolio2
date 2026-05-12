import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import { prisma } from "../../prisma.server";
import {
  moneyAbs,
  moneyAdd,
  moneySum,
  toMoneyNumber,
} from "../../shared/money";
import { isMultiUnitTransaction } from "./period-helpers";
import { isNearZero, isWithinPeriod } from "./period-overview-holdings-common";

type ExecutionResidualBooking = {
  id: string;
  accountId: string;
  date: Date;
  value: number;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  account: {
    name: string;
  };
};

type ExecutionResidualContribution = {
  accountId: string;
  accountName: string;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  realizedGainLoss: number;
};

function isNonReferenceExecutionBooking(args: {
  unit: Unit;
  currency: string | null;
  referenceCurrency: string;
}) {
  if (args.unit === Unit.CURRENCY) {
    return (
      args.currency != null &&
      args.currency.toUpperCase() !== args.referenceCurrency
    );
  }

  return true;
}

export async function computeExecutionResidualRealization(args: {
  accountBookId: string;
  periodStart: Date;
  periodEndExclusive: Date;
  referenceCurrency: string;
  trackedHoldingAccountIdSet: Set<string>;
  pageSize: number;
  convertBookingToReference: (booking: {
    value: number;
    unit: Unit;
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
    date: Date;
  }) => Promise<number | null>;
  onContribution: (contribution: ExecutionResidualContribution) => void;
}) {
  let realizedGainLoss = 0;
  let convertedCount = 0;
  let skippedCount = 0;
  let nextTransactionIdCursor: string | undefined;

  while (true) {
    const transactionsPage = await prisma.transaction.findMany({
      where: {
        accountBookId: args.accountBookId,
        AND: [
          {
            bookings: {
              some: {
                date: {
                  gte: args.periodStart,
                  lt: args.periodEndExclusive,
                },
              },
            },
          },
          {
            bookings: {
              some: {
                account: {
                  type: AccountType.EQUITY,
                  equityAccountSubtype: {
                    in: [
                      EquityAccountSubtype.INCOME,
                      EquityAccountSubtype.EXPENSE,
                    ],
                  },
                },
              },
            },
          },
          {
            bookings: {
              none: {
                date: {
                  gte: args.periodEndExclusive,
                },
              },
            },
          },
          {
            bookings: {
              none: {
                account: {
                  type: AccountType.EQUITY,
                  equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
                },
              },
            },
          },
          {
            bookings: {
              none: {
                account: {
                  type: AccountType.EQUITY,
                  equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
                },
              },
            },
          },
        ],
      },
      orderBy: { id: "asc" },
      take: args.pageSize,
      ...(nextTransactionIdCursor
        ? {
            cursor: {
              id_accountBookId: {
                id: nextTransactionIdCursor,
                accountBookId: args.accountBookId,
              },
            },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        bookings: {
          select: {
            id: true,
            accountId: true,
            date: true,
            value: true,
            unit: true,
            currency: true,
            cryptocurrency: true,
            symbol: true,
            tradeCurrency: true,
            account: {
              select: {
                name: true,
              },
            },
          },
          orderBy: [{ date: "asc" }, { id: "asc" }],
        },
      },
    });

    if (transactionsPage.length === 0) {
      break;
    }

    nextTransactionIdCursor = transactionsPage[transactionsPage.length - 1].id;

    for (const transaction of transactionsPage) {
      const nonExplicitBookings: ExecutionResidualBooking[] =
        transaction.bookings.map((booking) => ({
          id: booking.id,
          accountId: booking.accountId,
          date: booking.date,
          value: toMoneyNumber(booking.value),
          unit: booking.unit,
          currency: booking.currency,
          cryptocurrency: booking.cryptocurrency,
          symbol: booking.symbol,
          tradeCurrency: booking.tradeCurrency,
          account: {
            name: booking.account.name,
          },
        }));

      if (nonExplicitBookings.length === 0) {
        continue;
      }

      if (
        !isMultiUnitTransaction(
          nonExplicitBookings.map((booking) => ({
            unit: booking.unit,
            currency: booking.currency,
            cryptocurrency: booking.cryptocurrency,
            symbol: booking.symbol,
            tradeCurrency: booking.tradeCurrency,
          })),
        )
      ) {
        continue;
      }

      const hasInPeriodHoldingBooking = nonExplicitBookings.some(
        (booking) =>
          isWithinPeriod({
            date: booking.date,
            periodStart: args.periodStart,
            periodEndExclusive: args.periodEndExclusive,
          }) && args.trackedHoldingAccountIdSet.has(booking.accountId),
      );
      if (hasInPeriodHoldingBooking) {
        continue;
      }

      const convertedValues = await Promise.all(
        nonExplicitBookings.map((booking) =>
          args.convertBookingToReference({
            value: booking.value,
            unit: booking.unit,
            currency: booking.currency,
            cryptocurrency: booking.cryptocurrency,
            symbol: booking.symbol,
            tradeCurrency: booking.tradeCurrency,
            date: booking.date,
          }),
        ),
      );

      let executionResidualInReference = 0;
      const convertedByBookingId = new Map<string, number>();
      let hasMissingConversion = false;

      for (let index = 0; index < nonExplicitBookings.length; index += 1) {
        const booking = nonExplicitBookings[index]!;
        const convertedValue = convertedValues[index];

        if (convertedValue == null) {
          skippedCount += 1;
          hasMissingConversion = true;
          continue;
        }

        convertedCount += 1;
        executionResidualInReference = toMoneyNumber(
          moneyAdd(executionResidualInReference, convertedValue),
        );
        convertedByBookingId.set(booking.id, convertedValue);
      }

      if (hasMissingConversion || isNearZero(executionResidualInReference)) {
        continue;
      }

      realizedGainLoss = toMoneyNumber(
        moneyAdd(realizedGainLoss, executionResidualInReference),
      );

      const nonReferenceBookings = nonExplicitBookings.filter((booking) =>
        isNonReferenceExecutionBooking({
          unit: booking.unit,
          currency: booking.currency,
          referenceCurrency: args.referenceCurrency,
        }),
      );
      if (nonReferenceBookings.length === 0) {
        continue;
      }

      const attributionWeights = nonReferenceBookings.map((booking) =>
        toMoneyNumber(moneyAbs(convertedByBookingId.get(booking.id) ?? 0)),
      );
      const totalAttributionWeight = toMoneyNumber(
        moneySum(attributionWeights),
      );

      for (
        let attributionIndex = 0;
        attributionIndex < nonReferenceBookings.length;
        attributionIndex += 1
      ) {
        const booking = nonReferenceBookings[attributionIndex]!;
        const weight =
          totalAttributionWeight > 0
            ? attributionWeights[attributionIndex]! / totalAttributionWeight
            : 1 / nonReferenceBookings.length;

        args.onContribution({
          accountId: booking.accountId,
          accountName: booking.account.name,
          unit: booking.unit,
          currency: booking.currency,
          cryptocurrency: booking.cryptocurrency,
          symbol: booking.symbol,
          tradeCurrency: booking.tradeCurrency,
          realizedGainLoss: executionResidualInReference * weight,
        });
      }
    }

    if (transactionsPage.length < args.pageSize) {
      break;
    }
  }

  return {
    realizedGainLoss,
    convertedCount,
    skippedCount,
  };
}

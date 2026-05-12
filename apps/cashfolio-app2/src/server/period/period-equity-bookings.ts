import { EquityAccountSubtype, Unit } from "../../.prisma-client/enums";
import type { PeriodBaseData } from "../period/period-base-data-cache";
import {
  accumulateGainLossContribution,
  type GainLossContributionAccumulator,
} from "./period-gains-losses-contributions";
import {
  accumulateConvertedEquityBooking,
  type PeriodOverviewEquityAggregation,
} from "./period-overview-aggregation";

const DEFAULT_EQUITY_CONVERSION_BATCH_SIZE = 500;

type PeriodBaseEquityBooking = PeriodBaseData["equityBookings"][number];

export async function processPeriodEquityBookingsFromBaseData(args: {
  equityBookings: PeriodBaseData["equityBookings"];
  explicitCounterparts: PeriodBaseData["explicitCounterparts"];
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
  conversionBatchSize?: number;
}) {
  const explicitCounterpartAccountByTransactionId = new Map(
    args.explicitCounterparts.map((counterpart) => [
      counterpart.transactionId,
      {
        id: counterpart.accountId,
        name: counterpart.accountName,
      },
    ]),
  );
  const explicitConvertedBookings: Array<{
    bookingId: string;
    transactionId: string;
    unit: PeriodBaseEquityBooking["unit"];
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
    convertedValue: number;
  }> = [];

  let bookingsCount = 0;
  let convertedCount = 0;
  let skippedCount = 0;
  const conversionBatchSize =
    args.conversionBatchSize ?? DEFAULT_EQUITY_CONVERSION_BATCH_SIZE;

  for (
    let startIndex = 0;
    startIndex < args.equityBookings.length;
    startIndex += conversionBatchSize
  ) {
    const batch = args.equityBookings.slice(
      startIndex,
      startIndex + conversionBatchSize,
    );
    bookingsCount += batch.length;

    const convertedValues = await Promise.all(
      batch.map((booking) =>
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

    for (let index = 0; index < batch.length; index += 1) {
      const booking = batch[index]!;
      const convertedValue = convertedValues[index];

      if (convertedValue == null) {
        skippedCount += 1;
        continue;
      }

      convertedCount += 1;

      if (
        booking.equityAccountSubtype === EquityAccountSubtype.INCOME ||
        booking.equityAccountSubtype === EquityAccountSubtype.EXPENSE ||
        booking.equityAccountSubtype === EquityAccountSubtype.GAIN_LOSS
      ) {
        accumulateConvertedEquityBooking({
          booking: {
            account: {
              id: booking.accountId,
              name: booking.accountName,
              groupId: booking.accountGroupId,
              equityAccountSubtype: booking.equityAccountSubtype,
            },
          },
          convertedValue,
          aggregation: args.equityAggregation,
        });
      }

      if (booking.equityAccountSubtype === EquityAccountSubtype.GAIN_LOSS) {
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
  }

  for (const explicitBooking of explicitConvertedBookings) {
    const counterpartAccount = explicitCounterpartAccountByTransactionId.get(
      explicitBooking.transactionId,
    );
    if (!counterpartAccount) {
      throw new Error(
        `Explicit gain/loss booking invariant violated for booking ${explicitBooking.bookingId} in transaction ${explicitBooking.transactionId}: missing resolved counterpart account.`,
      );
    }

    accumulateGainLossContribution({
      byKey: args.gainsLossesContributionByKey,
      sourceKind: "EXPLICIT",
      accountId: counterpartAccount.id,
      accountName: counterpartAccount.name,
      unit: explicitBooking.unit,
      currency: explicitBooking.currency,
      cryptocurrency: explicitBooking.cryptocurrency,
      symbol: explicitBooking.symbol,
      tradeCurrency: explicitBooking.tradeCurrency,
      realizedGainLoss: -explicitBooking.convertedValue,
      unrealizedGainLoss: 0,
    });
  }

  return {
    bookingsCount,
    convertedCount,
    skippedCount,
  };
}

import { EquityAccountSubtype } from "../.prisma-client/enums";
import { startOfUtcDay } from "../shared/date";
import {
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
} from "./period-conversion";
import { computeEndOfPeriodBalanceStatsWithConvertedBalances } from "./period-balance-stats";
import { getOrLoadPeriodBaseData } from "./period-base-data-cache";
import {
  accumulateConvertedEquityBooking,
  createPeriodOverviewEquityAggregation,
} from "./period-overview-aggregation";
import {
  accumulateGainLossContribution,
  type GainLossContributionAccumulator,
} from "./period-gains-losses-contributions";
import {
  applyHoldingTransactionsToGainLossState,
  finalizeHoldingGainLossState,
  initializeHoldingGainLossState,
} from "./period-overview-holdings";
import {
  buildTransferClearingVirtualHierarchy,
  computeTransferClearingGainLossSplit,
} from "./period-transfer-clearing";
import { buildPeriodOverviewResponse } from "./period-overview-response";

const EQUITY_CONVERSION_BATCH_SIZE = 500;

export async function loadPeriodOverview(args: {
  accountBookId: string;
  period?: unknown;
}) {
  const baseData = await getOrLoadPeriodBaseData(args);

  const referenceCurrency = baseData.referenceCurrency;
  const selection = baseData.selection;
  const minPeriodDate = selection.minPeriodDate;
  const currentDay = startOfUtcDay(new Date());
  const queryStart = selection.from;
  const queryEndExclusive = selection.queryEndExclusive;
  const initialHoldingDate = selection.initialHoldingDate;
  const isBeforeAccountBookStart = selection.isBeforeAccountBookStart;

  const assetLiabilityAccountNameById = new Map(
    baseData.baseAssetLiabilityAccounts.map((account) => [
      account.id,
      account.name,
    ]),
  );

  const endOfPeriodRawBalanceByAccountId = new Map(
    baseData.endOfPeriodRawBalances.map((balance) => [
      balance.accountId,
      balance.rawBalance,
    ]),
  );

  const {
    virtualGroups: transferClearingVirtualGroups,
    virtualAccounts: transferClearingVirtualAccounts,
    rawBalanceByVirtualAccountId,
  } = buildTransferClearingVirtualHierarchy({
    unitBuckets: baseData.transferClearingUnitBuckets,
  });

  const groupById = new Map(
    baseData.allAccountGroups.map((group) => [group.id, group]),
  );
  for (const virtualGroup of transferClearingVirtualGroups) {
    groupById.set(virtualGroup.id, virtualGroup);
  }

  const assetLiabilityAccounts = [
    ...baseData.baseAssetLiabilityAccounts,
    ...transferClearingVirtualAccounts,
  ];
  for (const virtualAccount of transferClearingVirtualAccounts) {
    assetLiabilityAccountNameById.set(virtualAccount.id, virtualAccount.name);
  }
  for (const [accountId, rawBalance] of rawBalanceByVirtualAccountId) {
    endOfPeriodRawBalanceByAccountId.set(accountId, rawBalance);
  }

  let bookingsCount = 0;
  let convertedBookingsCount = 0;
  let skippedBookingsCount = 0;

  const exchangeRateByKey = new Map<string, Promise<number | null>>();
  const equityAggregation = createPeriodOverviewEquityAggregation();
  const gainsLossesContributionByKey = new Map<
    string,
    GainLossContributionAccumulator
  >();

  let realizedGainLoss = 0;
  let unrealizedGainLoss = 0;

  if (!isBeforeAccountBookStart) {
    const explicitCounterpartAccountByTransactionId = new Map(
      baseData.explicitCounterparts.map((counterpart) => [
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
      unit: (typeof baseData.equityBookings)[number]["unit"];
      currency: string | null;
      cryptocurrency: string | null;
      symbol: string | null;
      tradeCurrency: string | null;
      convertedValue: number;
    }> = [];

    for (
      let startIndex = 0;
      startIndex < baseData.equityBookings.length;
      startIndex += EQUITY_CONVERSION_BATCH_SIZE
    ) {
      const batch = baseData.equityBookings.slice(
        startIndex,
        startIndex + EQUITY_CONVERSION_BATCH_SIZE,
      );
      bookingsCount += batch.length;

      const convertedValues = await Promise.all(
        batch.map((booking) =>
          convertBookingValueToReference({
            value: booking.value,
            unit: booking.unit,
            currency: booking.currency,
            cryptocurrency: booking.cryptocurrency,
            symbol: booking.symbol,
            tradeCurrency: booking.tradeCurrency,
            date: booking.date,
            referenceCurrency,
            exchangeRateByKey,
          }),
        ),
      );

      for (let index = 0; index < batch.length; index += 1) {
        const booking = batch[index]!;
        const convertedValue = convertedValues[index];

        if (convertedValue == null) {
          skippedBookingsCount += 1;
          continue;
        }

        convertedBookingsCount += 1;

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
            aggregation: equityAggregation,
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
        byKey: gainsLossesContributionByKey,
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

    if (baseData.holdingAccountsResolved.length > 0) {
      const initialHoldingBalanceByAccountId = new Map(
        baseData.initialHoldingBalances.map((balance) => [
          balance.accountId,
          balance.rawBalance,
        ]),
      );

      const holdingGainLossState = await initializeHoldingGainLossState({
        holdingAccounts: baseData.holdingAccountsResolved,
        initialBalanceByAccountId: initialHoldingBalanceByAccountId,
        initialRateDate: initialHoldingDate,
        resolveRate: (input) =>
          getUnitToReferenceExchangeRate({
            ...input,
            referenceCurrency,
            exchangeRateByKey,
          }),
      });

      await applyHoldingTransactionsToGainLossState({
        state: holdingGainLossState,
        transactions: baseData.holdingTransactions.map((transaction) => ({
          bookings: transaction.bookings,
        })),
        periodStart: queryStart,
        periodEndExclusive: queryEndExclusive,
        convertBookingToReference: ({ id: _id, ...booking }) =>
          convertBookingValueToReference({
            ...booking,
            referenceCurrency,
            exchangeRateByKey,
          }),
      });

      const holdingGainLossSplit = await finalizeHoldingGainLossState({
        state: holdingGainLossState,
        periodEnd: selection.to,
        resolveRate: (input) =>
          getUnitToReferenceExchangeRate({
            ...input,
            referenceCurrency,
            exchangeRateByKey,
          }),
        onAccountGainLoss: (gainLossByAccount) => {
          accumulateGainLossContribution({
            byKey: gainsLossesContributionByKey,
            sourceKind: "HOLDING",
            accountId: gainLossByAccount.accountId,
            accountName:
              assetLiabilityAccountNameById.get(gainLossByAccount.accountId) ??
              "Unknown account",
            unit: gainLossByAccount.unit,
            currency: gainLossByAccount.currency,
            cryptocurrency: gainLossByAccount.cryptocurrency,
            symbol: gainLossByAccount.symbol,
            tradeCurrency: gainLossByAccount.tradeCurrency,
            realizedGainLoss: gainLossByAccount.realizedGainLoss,
            unrealizedGainLoss: gainLossByAccount.unrealizedGainLoss,
          });
        },
      });

      realizedGainLoss += holdingGainLossSplit.realizedGainLoss;
      unrealizedGainLoss += holdingGainLossSplit.unrealizedGainLoss;
      convertedBookingsCount += holdingGainLossSplit.convertedCount;
      skippedBookingsCount += holdingGainLossSplit.skippedCount;
    }

    const transferClearingGainLossSplit =
      await computeTransferClearingGainLossSplit({
        unitBuckets: baseData.transferClearingUnitBuckets,
        periodStart: queryStart,
        periodEndExclusive: queryEndExclusive,
        initialRateDate: initialHoldingDate,
        periodEnd: selection.to,
        resolveRate: (input) =>
          getUnitToReferenceExchangeRate({
            ...input,
            referenceCurrency,
            exchangeRateByKey,
          }),
        convertBookingToReference: (booking) =>
          convertBookingValueToReference({
            value: booking.value,
            unit: booking.unit,
            currency: booking.currency,
            cryptocurrency: booking.cryptocurrency,
            symbol: booking.symbol,
            tradeCurrency: booking.tradeCurrency,
            date: booking.date,
            referenceCurrency,
            exchangeRateByKey,
          }),
        onUnitGainLoss: (gainLossByUnit) => {
          const transferClearingAccountId = `virtual:transfer-clearing:account:${gainLossByUnit.unitKey}`;
          accumulateGainLossContribution({
            byKey: gainsLossesContributionByKey,
            sourceKind: "HOLDING",
            accountId: transferClearingAccountId,
            accountName:
              assetLiabilityAccountNameById.get(transferClearingAccountId) ??
              gainLossByUnit.unitLabel,
            unit: gainLossByUnit.unit,
            currency: gainLossByUnit.currency,
            cryptocurrency: gainLossByUnit.cryptocurrency,
            symbol: gainLossByUnit.symbol,
            tradeCurrency: gainLossByUnit.tradeCurrency,
            realizedGainLoss: gainLossByUnit.realizedGainLoss,
            unrealizedGainLoss: gainLossByUnit.unrealizedGainLoss,
          });
        },
      });

    realizedGainLoss += transferClearingGainLossSplit.realizedGainLoss;
    unrealizedGainLoss += transferClearingGainLossSplit.unrealizedGainLoss;
    convertedBookingsCount += transferClearingGainLossSplit.convertedCount;
    skippedBookingsCount += transferClearingGainLossSplit.skippedCount;
  }

  const endOfPeriodBalanceStats =
    await computeEndOfPeriodBalanceStatsWithConvertedBalances({
      accounts: assetLiabilityAccounts,
      rawBalanceByAccountId: endOfPeriodRawBalanceByAccountId,
      periodEnd: selection.to,
      referenceCurrency,
      convertBalanceToReference: async (input) =>
        convertBookingValueToReference({
          ...input,
          exchangeRateByKey,
        }),
    });
  skippedBookingsCount += endOfPeriodBalanceStats.skippedCount;

  return buildPeriodOverviewResponse({
    selection,
    minPeriodDate,
    currentDay,
    referenceCurrency,
    groupById,
    assetLiabilityAccounts,
    equityAggregation,
    realizedGainLoss,
    unrealizedGainLoss,
    isBeforeAccountBookStart,
    endOfPeriodBalanceStats,
    bookingsCount,
    convertedBookingsCount,
    skippedBookingsCount,
    gainsLossesContributions: Array.from(gainsLossesContributionByKey.values()),
  });
}

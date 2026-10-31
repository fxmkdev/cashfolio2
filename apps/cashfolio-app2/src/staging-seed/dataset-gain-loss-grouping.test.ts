import { defaultAssetClassIds } from "../shared/asset-class";
import { describe, expect, it } from "vitest";
import { AccountType, Unit } from "../.prisma-client/enums";
import { toMoney } from "../shared/money";
import { toNumericMoney } from "../server/money-boundary";
import { buildGainLossAccountAttribution } from "../server/period/breakdown/period-gain-loss-attribution";
import { buildGainsLossesBreakdown } from "../server/period/breakdown/period-gains-losses-breakdown";
import {
  accumulateGainLossContribution,
  type GainLossContributionAccumulator,
} from "../server/period/breakdown/period-gains-losses-contributions";
import { computeExecutionResidualRealization } from "../server/period/holdings/period-execution-residuals";
import {
  getPeriodEndExclusive,
  resolvePeriodSelection,
} from "../server/period/period-selection";
import { generateStagingDataset, getZurichToday } from "./dataset";

describe("staging gain/loss grouping demo", () => {
  it.each([
    ["2026-10-10T12:00:00Z", "2026-10-08", "2026-10"],
    ["2026-10-31T12:00:00Z", "2026-10-29", "2026-10"],
    ["2026-10-01T12:00:00Z", "2026-09-29", "2026-09"],
    ["2026-10-02T12:00:00Z", "2026-09-30", "2026-09"],
    ["2026-01-01T12:00:00Z", "2025-12-30", "2025-12"],
    ["2024-02-29T12:00:00Z", "2024-02-27", "2024-02"],
    ["2024-03-01T12:00:00Z", "2024-02-28", "2024-02"],
    ["2024-03-02T12:00:00Z", "2024-02-29", "2024-02"],
    ["2026-10-30T23:30:00Z", "2026-10-29", "2026-10"],
    ["2026-06-30T22:30:00Z", "2026-06-29", "2026-06"],
    ["2026-07-01T22:30:00Z", "2026-06-30", "2026-06"],
    ["2025-12-31T23:30:00Z", "2025-12-30", "2025-12"],
  ])(
    "makes the demo reportable at %s with booking day %s in %s",
    async (instant, bookingDay, periodValue) => {
      const now = new Date(instant);
      const household = generateStagingDataset(getZurichToday(now)).books[0];
      const bookingDate = new Date(`${bookingDay}T00:00:00Z`);
      const selection = resolvePeriodSelection({
        periodValue,
        now,
        firstBookingDate: household.startDate,
      });
      expect(selection.periodValue).toBe(periodValue);
      const periodEndExclusive = getPeriodEndExclusive(selection.to);
      const transactions = household.transactions.filter(
        ({ description }) =>
          description === "Grouping demo: EUR card purchase settled in CHF",
      );
      expect(transactions).toHaveLength(1);
      expect(transactions[0]!.bookings).toEqual([
        expect.objectContaining({
          accountKey: "current",
          value: "-105",
          date: bookingDate,
          unit: Unit.CURRENCY,
          currency: "CHF",
        }),
        expect.objectContaining({
          accountKey: "travel",
          value: "100",
          date: bookingDate,
          unit: Unit.CURRENCY,
          currency: "EUR",
        }),
      ]);
      for (const booking of transactions[0]!.bookings) {
        expect(booking.date >= selection.from).toBe(true);
        expect(booking.date < periodEndExclusive).toBe(true);
      }
      const accounts = new Map(
        household.accounts.map((account) => [account.key, account]),
      );
      expect(accounts.get("travel")).toMatchObject({
        type: AccountType.EQUITY,
        assetClassId: null,
      });
      expect(accounts.get("travel")!.currency).toBeUndefined();
      const baseAssetLiabilityAccounts = household.accounts
        .filter((account) => account.type === AccountType.BALANCE)
        .map((account) => ({
          ...account,
          id: account.key,
          groupId: account.groupKey ?? null,
          unit: account.unit ?? null,
          currency: account.currency ?? null,
          cryptocurrency: account.cryptocurrency ?? null,
          symbol: account.symbol ?? null,
          tradeCurrency: account.tradeCurrency ?? null,
        }));
      const byKey = new Map<string, GainLossContributionAccumulator>();
      const residual = await computeExecutionResidualRealization({
        transactions: transactions.map((transaction) => ({
          id: transaction.description,
          bookings: transaction.bookings.map((booking) => ({
            id: `${booking.accountKey}:${booking.sortOrder}`,
            accountId: booking.accountKey,
            account: { name: accounts.get(booking.accountKey)!.name },
            date: booking.date,
            value: toMoney(booking.value),
            unit: booking.unit,
            currency: booking.currency ?? null,
            cryptocurrency: booking.cryptocurrency ?? null,
            symbol: booking.symbol ?? null,
            tradeCurrency: booking.tradeCurrency ?? null,
          })),
        })),
        periodStart: selection.from,
        periodEndExclusive,
        referenceCurrency: household.referenceCurrency,
        trackedHoldingAccountIdSet: new Set(),
        assetLiabilityAccountIdSet: new Set(
          baseAssetLiabilityAccounts.map((account) => account.id),
        ),
        convertBookingToReference: async (booking) =>
          booking.currency === "EUR"
            ? booking.value.times("0.95")
            : booking.value,
        onContribution: (contribution) =>
          accumulateGainLossContribution({
            byKey,
            sourceKind: "HOLDING",
            ...contribution,
            unrealizedGainLoss: toMoney(0),
          }),
      });
      expect(toNumericMoney(residual)).toEqual({
        realizedGainLoss: -10,
        convertedCount: 2,
        skippedCount: 0,
      });
      const contributions = [...byKey.values()];
      expect(toNumericMoney(contributions)).toMatchObject([
        {
          accountId: "travel",
          originatingAccountIds: ["current"],
          realizedGainLoss: -10,
          unrealizedGainLoss: 0,
        },
      ]);
      const { hierarchy } = buildGainsLossesBreakdown({
        contributions,
        referenceCurrency: household.referenceCurrency,
        accountAttributionById: buildGainLossAccountAttribution(
          {
            baseAssetLiabilityAccounts,
            transferClearingUnitBuckets: [],
            executionResidualTransactions: [],
          },
          contributions,
        ),
      });
      expect(toNumericMoney(hierarchy)).toMatchObject([
        {
          label: "Cash & Cash Equivalents",
          totalGainLoss: -10,
          children: [
            {
              label: "EUR",
              totalGainLoss: -10,
              children: [
                {
                  label: "Travel",
                  totalGainLoss: -10,
                  account: {
                    id: "travel",
                    assetClassId:
                      defaultAssetClassIds.CASH_AND_CASH_EQUIVALENTS,
                    explanation:
                      "Grouped under Cash & Cash Equivalents based on the originating account: Everyday account CHF.",
                  },
                },
              ],
            },
          ],
        },
      ]);
    },
  );
});

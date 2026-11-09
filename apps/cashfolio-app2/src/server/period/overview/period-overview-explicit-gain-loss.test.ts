import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EquityAccountSubtype, Unit } from "../../../.prisma-client/enums";
import { toMoney } from "../../../shared/money";
import {
  cleanupOverview,
  convertBookingValueToReference,
  getPeriodOverview,
  isEquityBookingQuery,
  isTransferClearingBookingQuery,
  prisma,
  resetOverview,
  transactionFilterIncludes,
} from "./period-overview.test-support";

describe("getPeriodOverview", () => {
  beforeEach(resetOverview);

  afterEach(cleanupOverview);

  it("attributes explicit gain/loss bookings with multiple counterpart accounts to an unattributed bucket", async () => {
    vi.setSystemTime(new Date("2026-02-10T10:00:00.000Z"));
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.account.findMany.mockResolvedValue([]);
    prisma.booking.findMany.mockImplementation((args) => {
      if (isTransferClearingBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (transactionFilterIncludes(args.where?.transactionId, "tx-explicit")) {
        return Promise.resolve([
          {
            transactionId: "tx-explicit",
            accountId: "asset-cash-1",
            account: {
              name: "Cash 1",
            },
          },
          {
            transactionId: "tx-explicit",
            accountId: "asset-cash-2",
            account: {
              name: "Cash 2",
            },
          },
        ]);
      }
      if (!isEquityBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (args.cursor) {
        return Promise.resolve([]);
      }
      return Promise.resolve([
        {
          id: "booking-explicit-gain-loss",
          transactionId: "tx-explicit",
          date: new Date("2026-01-18T00:00:00.000Z"),
          value: -5,
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
          account: {
            id: "gainloss-1",
            name: "GainLoss",
            groupId: null,
            equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
          },
        },
      ]);
    });
    prisma.booking.groupBy.mockResolvedValue([]);

    const result = await getPeriodOverview({
      data: {
        accountBookId: "book-invalid-explicit",
        period: "2026-01",
      },
    });

    expect(result.stats.gainsLosses).toBe(5);
    expect(
      result.accountBreakdownsByGrouping.assetClass.gainsLossesBreakdown
        .hierarchy,
    ).toMatchObject([
      {
        id: "asset-class:unclassified",
        label: "Unclassified",
        children: [
          {
            label: "Unknown Unit",
            children: [
              {
                label: "Unattributed (Multiple Counterpart Accounts)",
                totalGainLoss: 5,
              },
            ],
          },
        ],
        totalGainLoss: 5,
      },
    ]);
  });

  it("attributes explicit gain/loss bookings without counterpart accounts to an unattributed bucket", async () => {
    vi.setSystemTime(new Date("2026-02-10T10:00:00.000Z"));
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.account.findMany.mockResolvedValue([]);
    prisma.booking.findMany.mockImplementation((args) => {
      if (isTransferClearingBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (transactionFilterIncludes(args.where?.transactionId, "tx-explicit")) {
        return Promise.resolve([]);
      }
      if (!isEquityBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (args.cursor) {
        return Promise.resolve([]);
      }
      return Promise.resolve([
        {
          id: "booking-explicit-gain-loss",
          transactionId: "tx-explicit",
          date: new Date("2026-01-18T00:00:00.000Z"),
          value: -5,
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
          account: {
            id: "gainloss-1",
            name: "GainLoss",
            groupId: null,
            equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
          },
        },
      ]);
    });
    prisma.booking.groupBy.mockResolvedValue([]);

    const result = await getPeriodOverview({
      data: {
        accountBookId: "book-missing-explicit-counterpart",
        period: "2026-01",
      },
    });

    expect(result.stats.gainsLosses).toBe(5);
    expect(
      result.accountBreakdownsByGrouping.assetClass.gainsLossesBreakdown
        .hierarchy,
    ).toMatchObject([
      {
        id: "asset-class:unclassified",
        label: "Unclassified",
        children: [
          {
            label: "Unknown Unit",
            children: [
              {
                label: "Unattributed (No Counterpart Account)",
                totalGainLoss: 5,
              },
            ],
          },
        ],
        totalGainLoss: 5,
      },
    ]);
  });

  it("ignores near-zero explicit gain/loss contributions in the breakdown", async () => {
    vi.setSystemTime(new Date("2026-02-10T10:00:00.000Z"));
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.account.findMany.mockResolvedValue([]);
    prisma.booking.findMany.mockImplementation((args) => {
      if (isTransferClearingBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (isEquityBookingQuery(args)) {
        if (args.cursor) {
          return Promise.resolve([]);
        }
        return Promise.resolve([
          {
            id: "booking-explicit-gain-loss",
            transactionId: "tx-explicit",
            date: new Date("2026-01-18T00:00:00.000Z"),
            value: -1,
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
            account: {
              id: "gainloss-1",
              name: "GainLoss",
              groupId: null,
              equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
            },
          },
        ]);
      }

      if (transactionFilterIncludes(args.where?.transactionId, "tx-explicit")) {
        return Promise.resolve([
          {
            transactionId: "tx-explicit",
            accountId: "asset-cash",
            account: {
              name: "Cash",
            },
          },
        ]);
      }

      return Promise.resolve([]);
    });
    prisma.booking.groupBy.mockResolvedValue([]);
    convertBookingValueToReference.mockImplementation(async ({ value }) => {
      if (toMoney(value).equals(-1)) {
        return -1e-12;
      }
      return value;
    });

    const result = await getPeriodOverview({
      data: {
        accountBookId: "book-near-zero-explicit",
        period: "2026-01",
      },
    });

    expect(result.stats.gainsLosses).toBe(0);
    expect(
      result.accountBreakdownsByGrouping.assetClass.gainsLossesBreakdown
        .hierarchy,
    ).toEqual([]);
  });
});

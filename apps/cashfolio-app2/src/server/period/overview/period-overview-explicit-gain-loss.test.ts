import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../../.prisma-client/enums";
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

  it("batches explicit counterpart account resolution across explicit transactions in the period", async () => {
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
            id: "booking-explicit-1",
            transactionId: "tx-explicit-1",
            date: new Date("2026-01-10T00:00:00.000Z"),
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
          {
            id: "booking-explicit-2",
            transactionId: "tx-explicit-2",
            date: new Date("2026-01-11T00:00:00.000Z"),
            value: -7,
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

      if (
        typeof args.where?.transactionId === "object" &&
        args.where.transactionId != null &&
        "in" in args.where.transactionId
      ) {
        return Promise.resolve([
          {
            transactionId: "tx-explicit-1",
            accountId: "asset-cash-1",
            account: {
              name: "Cash 1",
            },
          },
          {
            transactionId: "tx-explicit-2",
            accountId: "asset-cash-2",
            account: {
              name: "Cash 2",
            },
          },
        ]);
      }

      return Promise.resolve([]);
    });
    prisma.booking.groupBy.mockResolvedValue([]);

    const result = await getPeriodOverview({
      data: {
        accountBookId: "book-batched-explicit",
        period: "2026-01",
      },
    });

    const counterpartLookupCalls = prisma.booking.findMany.mock.calls.filter(
      ([args]) =>
        typeof args.where?.transactionId === "object" &&
        args.where.transactionId != null &&
        "in" in args.where.transactionId,
    );

    expect(counterpartLookupCalls).toHaveLength(1);
    expect(counterpartLookupCalls[0]?.[0].where?.transactionId).toMatchObject({
      in: expect.arrayContaining(["tx-explicit-1", "tx-explicit-2"]),
    });
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
                label: "Cash 1",
                totalGainLoss: 5,
              },
              {
                label: "Cash 2",
                totalGainLoss: 7,
              },
            ],
          },
        ],
        totalGainLoss: 12,
      },
    ]);
  });

  it("filters equity bookings via preloaded accountId list when available", async () => {
    vi.setSystemTime(new Date("2026-02-10T10:00:00.000Z"));
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.account.findMany.mockImplementation((args) => {
      if (args.where?.type === AccountType.EQUITY) {
        return Promise.resolve([
          {
            id: "equity-gainloss",
            name: "GainLoss",
            groupId: null,
            equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
          },
        ]);
      }

      return Promise.resolve([]);
    });
    prisma.booking.findMany.mockImplementation((args) => {
      if (isEquityBookingQuery(args)) {
        if (args.cursor) {
          return Promise.resolve([]);
        }

        return Promise.resolve([
          {
            id: "booking-explicit-1",
            accountId: "equity-gainloss",
            transactionId: "tx-explicit-1",
            date: new Date("2026-01-10T00:00:00.000Z"),
            value: -5,
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
            account: {
              id: "equity-gainloss",
              name: "GainLoss",
              groupId: null,
              equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
            },
          },
        ]);
      }
      if (isTransferClearingBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (
        typeof args.where?.transactionId === "object" &&
        args.where.transactionId != null &&
        "in" in args.where.transactionId
      ) {
        return Promise.resolve([
          {
            transactionId: "tx-explicit-1",
            accountId: "asset-cash-1",
            account: {
              name: "Cash 1",
            },
          },
        ]);
      }

      return Promise.resolve([]);
    });
    prisma.booking.groupBy.mockResolvedValue([]);

    await getPeriodOverview({
      data: {
        accountBookId: "book-account-id-filter",
        period: "2026-01",
      },
    });

    const firstEquityBookingsCall = prisma.booking.findMany.mock.calls.find(
      ([args]) =>
        "where" in args &&
        typeof args.where === "object" &&
        args.where !== null &&
        "accountId" in args.where,
    );
    expect(firstEquityBookingsCall?.[0].where).toMatchObject({
      accountId: {
        in: ["equity-gainloss"],
      },
    });
  });

  it("batches explicit counterpart account resolution once across equity pages", async () => {
    vi.setSystemTime(new Date("2026-02-10T10:00:00.000Z"));
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.account.findMany.mockImplementation((args) => {
      if (args.where?.type === AccountType.EQUITY) {
        return Promise.resolve([
          {
            id: "equity-gainloss",
            name: "GainLoss",
            groupId: null,
            equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
          },
        ]);
      }

      return Promise.resolve([]);
    });
    let equityPageCallCount = 0;
    prisma.booking.findMany.mockImplementation((args) => {
      if (isTransferClearingBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (isEquityBookingQuery(args)) {
        if (equityPageCallCount === 0) {
          equityPageCallCount += 1;
          return Promise.resolve(
            Array.from({ length: 1_000 }, (_, index) => ({
              id: `booking-explicit-page-1-${index + 1}`,
              accountId: "equity-gainloss",
              transactionId: "tx-explicit-1",
              date: new Date("2026-01-10T00:00:00.000Z"),
              value: -5,
              unit: Unit.CURRENCY,
              currency: "CHF",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
              account: {
                id: "equity-gainloss",
                name: "GainLoss",
                groupId: null,
                equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
              },
            })),
          );
        }

        if (equityPageCallCount === 1) {
          equityPageCallCount += 1;
          return Promise.resolve([
            {
              id: "booking-explicit-2",
              accountId: "equity-gainloss",
              transactionId: "tx-explicit-2",
              date: new Date("2026-01-11T00:00:00.000Z"),
              value: -7,
              unit: Unit.CURRENCY,
              currency: "CHF",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
              account: {
                id: "equity-gainloss",
                name: "GainLoss",
                groupId: null,
                equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
              },
            },
          ]);
        }

        return Promise.resolve([]);
      }

      if (
        typeof args.where?.transactionId === "object" &&
        args.where.transactionId != null &&
        "in" in args.where.transactionId
      ) {
        return Promise.resolve([
          {
            transactionId: "tx-explicit-1",
            accountId: "asset-cash-1",
            account: {
              name: "Cash 1",
            },
          },
          {
            transactionId: "tx-explicit-2",
            accountId: "asset-cash-2",
            account: {
              name: "Cash 2",
            },
          },
        ]);
      }

      return Promise.resolve([]);
    });
    prisma.booking.groupBy.mockResolvedValue([]);

    await getPeriodOverview({
      data: {
        accountBookId: "book-batched-explicit-multi-page",
        period: "2026-01",
      },
    });

    const counterpartLookupCalls = prisma.booking.findMany.mock.calls.filter(
      ([args]) =>
        typeof args.where?.transactionId === "object" &&
        args.where.transactionId != null &&
        "in" in args.where.transactionId,
    );

    expect(counterpartLookupCalls).toHaveLength(1);
    expect(counterpartLookupCalls[0]?.[0].where?.transactionId).toMatchObject({
      in: expect.arrayContaining(["tx-explicit-1", "tx-explicit-2"]),
    });
  });
});

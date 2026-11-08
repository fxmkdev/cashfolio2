import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../../.prisma-client/enums";
import { moneyMultiply, type Money } from "../../../shared/money";
import {
  cleanupOverview,
  convertBookingValueToReference,
  getPeriodOverview,
  isEquityBookingQuery,
  isTransferClearingBookingQuery,
  prisma,
  resetOverview,
} from "./period-overview.test-support";
describe("getPeriodOverview", () => {
  beforeEach(resetOverview);
  afterEach(cleanupOverview);

  it("keeps total return equal to net-worth delta for explicit gain/loss periods", async () => {
    vi.setSystemTime(new Date("2026-03-10T10:00:00.000Z"));
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.account.findMany.mockResolvedValue([
      {
        id: "asset-cash",
        name: "Cash",
        groupId: null,
        type: AccountType.BALANCE,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
      },
    ]);
    prisma.booking.findMany.mockImplementation((args) => {
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
            transactionId: "tx-explicit-feb",
            accountId: "asset-cash",
            account: { name: "Cash" },
          },
        ]);
      }
      if (!isEquityBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (args.cursor) {
        return Promise.resolve([]);
      }
      const periodStart = args.where?.date?.gte?.toISOString().slice(0, 10);
      if (periodStart === "2026-02-01") {
        return Promise.resolve([
          {
            id: "booking-explicit-feb",
            transactionId: "tx-explicit-feb",
            date: new Date("2026-02-15T00:00:00.000Z"),
            value: -20,
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
      return Promise.resolve([]);
    });
    prisma.booking.groupBy.mockImplementation((args) => {
      const periodEndExclusive = args.where?.date?.lt
        ?.toISOString()
        .slice(0, 10);
      if (periodEndExclusive === "2026-02-01") {
        return Promise.resolve([
          { accountId: "asset-cash", _sum: { value: 100 } },
        ]);
      }
      if (periodEndExclusive === "2026-03-01") {
        return Promise.resolve([
          { accountId: "asset-cash", _sum: { value: 120 } },
        ]);
      }
      return Promise.resolve([]);
    });
    prisma.transaction.findMany.mockResolvedValue([]);
    convertBookingValueToReference.mockImplementation(
      async ({ value }) => value,
    );

    const january = await getPeriodOverview({
      data: {
        accountBookId: "book-explicit-reconcile",
        period: "2026-01",
      },
    });
    const february = await getPeriodOverview({
      data: {
        accountBookId: "book-explicit-reconcile",
        period: "2026-02",
      },
    });

    expect(february.stats.totalReturn).toBe(20);
    expect(february.stats.totalReturn).toBe(
      february.stats.endOfPeriodNetWorth - january.stats.endOfPeriodNetWorth,
    );
  });

  it("keeps total return equal to net-worth delta for FX residual periods", async () => {
    vi.setSystemTime(new Date("2026-03-10T10:00:00.000Z"));
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.account.findMany.mockResolvedValue([
      {
        id: "asset-cash",
        name: "Cash",
        groupId: null,
        type: AccountType.BALANCE,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
      },
    ]);
    prisma.booking.findMany.mockImplementation((args) => {
      if (isTransferClearingBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (!isEquityBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (args.cursor) {
        return Promise.resolve([]);
      }
      const periodStart = args.where?.date?.gte?.toISOString().slice(0, 10);
      if (periodStart === "2026-02-01") {
        return Promise.resolve([
          {
            id: "booking-expense-usd-feb",
            transactionId: "tx-fx-expense-feb",
            date: new Date("2026-02-15T00:00:00.000Z"),
            value: 100,
            unit: Unit.CURRENCY,
            currency: "USD",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
            account: {
              id: "expense-foreign",
              name: "Travel USD",
              groupId: null,
              equityAccountSubtype: EquityAccountSubtype.EXPENSE,
            },
          },
        ]);
      }
      return Promise.resolve([]);
    });
    prisma.booking.groupBy.mockImplementation((args) => {
      const periodEndExclusive = args.where?.date?.lt
        ?.toISOString()
        .slice(0, 10);
      if (periodEndExclusive === "2026-02-01") {
        return Promise.resolve([
          { accountId: "asset-cash", _sum: { value: 100 } },
        ]);
      }
      if (periodEndExclusive === "2026-03-01") {
        return Promise.resolve([
          { accountId: "asset-cash", _sum: { value: 0 } },
        ]);
      }
      return Promise.resolve([]);
    });
    prisma.transaction.findMany.mockImplementation((args) => {
      const hasPeriodFilter = args.where?.AND?.[0]?.bookings?.some?.date?.gte
        ?.toISOString()
        .slice(0, 10);
      if (hasPeriodFilter !== "2026-02-01") {
        return Promise.resolve([]);
      }
      if (args.cursor) {
        return Promise.resolve([]);
      }
      return Promise.resolve([
        {
          id: "tx-fx-expense-feb",
          bookings: [
            {
              id: "booking-cash-chf-feb",
              accountId: "asset-cash",
              date: new Date("2026-02-15T00:00:00.000Z"),
              value: -100,
              unit: Unit.CURRENCY,
              currency: "CHF",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
              account: {
                name: "Cash",
                type: AccountType.BALANCE,
                equityAccountSubtype: null,
              },
            },
            {
              id: "booking-expense-usd-feb",
              accountId: "expense-foreign",
              date: new Date("2026-02-15T00:00:00.000Z"),
              value: 100,
              unit: Unit.CURRENCY,
              currency: "USD",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
              account: {
                name: "Travel USD",
                type: AccountType.EQUITY,
                equityAccountSubtype: EquityAccountSubtype.EXPENSE,
              },
            },
          ],
        },
      ]);
    });
    convertBookingValueToReference.mockImplementation(
      async ({ value, currency }: { value: Money; currency: string | null }) =>
        currency === "USD" ? moneyMultiply(value, 0.9) : value,
    );

    const january = await getPeriodOverview({
      data: {
        accountBookId: "book-fx-reconcile",
        period: "2026-01",
      },
    });
    const february = await getPeriodOverview({
      data: {
        accountBookId: "book-fx-reconcile",
        period: "2026-02",
      },
    });

    expect(february.stats.totalReturn).toBe(-100);
    expect(february.stats.totalReturn).toBe(
      february.stats.endOfPeriodNetWorth - january.stats.endOfPeriodNetWorth,
    );
  });
});

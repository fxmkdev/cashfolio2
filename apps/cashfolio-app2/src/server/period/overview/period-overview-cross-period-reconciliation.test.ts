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
  getUnitToReferenceExchangeRate,
  isEquityBookingQuery,
  isTransferClearingBookingQuery,
  prisma,
  resetOverview,
} from "./period-overview.test-support";
describe("getPeriodOverview", () => {
  beforeEach(resetOverview);
  afterEach(cleanupOverview);

  it("keeps total return equal to net-worth delta for equity-first cross-period expense completion", async () => {
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
        const periodEndExclusive = args.where?.date?.lt
          ?.toISOString()
          .slice(0, 10);
        if (periodEndExclusive === "2026-02-01") {
          return Promise.resolve([
            {
              id: "booking-expense-usd-jan",
              transactionId: "tx-equity-first",
              date: new Date("2026-01-31T00:00:00.000Z"),
              value: 100,
              unit: Unit.CURRENCY,
              currency: "USD",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
            },
          ]);
        }
        return Promise.resolve([]);
      }
      if (!isEquityBookingQuery(args)) {
        return Promise.resolve([]);
      }
      if (args.cursor) {
        return Promise.resolve([]);
      }
      const periodStart = args.where?.date?.gte?.toISOString().slice(0, 10);
      if (periodStart === "2026-01-01") {
        return Promise.resolve([
          {
            id: "booking-expense-usd-jan",
            transactionId: "tx-equity-first",
            date: new Date("2026-01-31T00:00:00.000Z"),
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
          { accountId: "asset-cash", _sum: { value: 0 } },
        ]);
      }
      if (periodEndExclusive === "2026-03-01") {
        return Promise.resolve([
          { accountId: "asset-cash", _sum: { value: -90 } },
        ]);
      }
      return Promise.resolve([]);
    });
    prisma.transaction.findMany.mockImplementation((args) => {
      const periodStart = args.where?.AND?.[0]?.bookings?.some?.date?.gte
        ?.toISOString()
        .slice(0, 10);
      if (periodStart !== "2026-02-01" || args.cursor) {
        return Promise.resolve([]);
      }
      return Promise.resolve([
        {
          id: "tx-equity-first",
          bookings: [
            {
              id: "booking-expense-usd-jan",
              accountId: "expense-foreign",
              date: new Date("2026-01-31T00:00:00.000Z"),
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
            {
              id: "booking-cash-chf-feb",
              accountId: "asset-cash",
              date: new Date("2026-02-01T00:00:00.000Z"),
              value: -90,
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
          ],
        },
      ]);
    });
    convertBookingValueToReference.mockImplementation(
      async ({ value, currency }: { value: Money; currency: string | null }) =>
        currency === "USD" ? moneyMultiply(value, 0.8) : value,
    );
    getUnitToReferenceExchangeRate.mockImplementation(
      async ({ currency }: { currency: string | null }) =>
        currency === "USD" ? 0.8 : 1,
    );

    const january = await getPeriodOverview({
      data: {
        accountBookId: "book-equity-first-completion",
        period: "2026-01",
      },
    });
    const february = await getPeriodOverview({
      data: {
        accountBookId: "book-equity-first-completion",
        period: "2026-02",
      },
    });

    expect(january.stats.totalReturn).toBe(-80);
    expect(january.stats.endOfPeriodNetWorth).toBe(-80);
    expect(february.stats.totalReturn).toBe(-10);
    expect(february.stats.totalReturn).toBe(
      february.stats.endOfPeriodNetWorth - january.stats.endOfPeriodNetWorth,
    );
  });

  it("keeps total return equal to net-worth delta for settlement-first cross-period expense completion", async () => {
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
        const periodEndExclusive = args.where?.date?.lt
          ?.toISOString()
          .slice(0, 10);
        if (periodEndExclusive === "2026-02-01") {
          return Promise.resolve([
            {
              id: "booking-cash-chf-jan",
              transactionId: "tx-settlement-first",
              date: new Date("2026-01-31T00:00:00.000Z"),
              value: -90,
              unit: Unit.CURRENCY,
              currency: "CHF",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
            },
          ]);
        }
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
            transactionId: "tx-settlement-first",
            date: new Date("2026-02-01T00:00:00.000Z"),
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
          { accountId: "asset-cash", _sum: { value: -90 } },
        ]);
      }
      if (periodEndExclusive === "2026-03-01") {
        return Promise.resolve([
          { accountId: "asset-cash", _sum: { value: -90 } },
        ]);
      }
      return Promise.resolve([]);
    });
    prisma.transaction.findMany.mockImplementation((args) => {
      const periodStart = args.where?.AND?.[0]?.bookings?.some?.date?.gte
        ?.toISOString()
        .slice(0, 10);
      if (periodStart !== "2026-02-01" || args.cursor) {
        return Promise.resolve([]);
      }
      return Promise.resolve([
        {
          id: "tx-settlement-first",
          bookings: [
            {
              id: "booking-cash-chf-jan",
              accountId: "asset-cash",
              date: new Date("2026-01-31T00:00:00.000Z"),
              value: -90,
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
              date: new Date("2026-02-01T00:00:00.000Z"),
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
        currency === "USD" ? moneyMultiply(value, 0.8) : value,
    );
    getUnitToReferenceExchangeRate.mockImplementation(
      async ({ currency }: { currency: string | null }) =>
        currency === "USD" ? 0.8 : 1,
    );

    const january = await getPeriodOverview({
      data: {
        accountBookId: "book-settlement-first-completion",
        period: "2026-01",
      },
    });
    const february = await getPeriodOverview({
      data: {
        accountBookId: "book-settlement-first-completion",
        period: "2026-02",
      },
    });

    expect(january.stats.totalReturn).toBe(0);
    expect(january.stats.endOfPeriodNetWorth).toBe(0);
    expect(february.stats.totalReturn).toBe(-90);
    expect(february.stats.totalReturn).toBe(
      february.stats.endOfPeriodNetWorth - january.stats.endOfPeriodNetWorth,
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType, Unit } from "../.prisma-client/enums";

const createServerFn = vi.hoisted(() =>
  vi.fn(() => {
    let validate: ((data: unknown) => unknown) | undefined;
    const chain = {
      inputValidator: vi.fn((validator: (data: unknown) => unknown) => {
        validate = validator;
        return chain;
      }),
      handler: vi.fn((handler: ({ data }: { data: unknown }) => unknown) => {
        return async ({ data }: { data: unknown }) => {
          const validatedData = validate ? validate(data) : data;
          return handler({ data: validatedData });
        };
      }),
    };
    return chain;
  }),
);

const ensureAuthorizedForAccountBookId = vi.hoisted(() => vi.fn());
const convertBookingValueToReference = vi.hoisted(() => vi.fn());
const getUnitToReferenceExchangeRate = vi.hoisted(() => vi.fn());

const prisma = vi.hoisted(() => ({
  accountBook: {
    findUniqueOrThrow: vi.fn(),
  },
  account: {
    findFirst: vi.fn(),
  },
  booking: {
    groupBy: vi.fn(),
    findMany: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
  },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId,
}));

vi.mock("../prisma.server", () => ({
  prisma,
}));

vi.mock("./period-conversion", () => ({
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
}));

import { getPeriodGainLossReconciliation } from "./period-gain-loss-reconciliation";

describe("getPeriodGainLossReconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));

    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });

    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.groupBy.mockResolvedValue([]);
    prisma.transaction.findMany.mockResolvedValue([]);
  });

  it("returns full reconciliation for a real holding account", async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: "account-aapl",
      name: "AAPL Trading",
      unit: Unit.SECURITY,
      currency: null,
      cryptocurrency: null,
      symbol: "AAPL",
      tradeCurrency: "USD",
    });

    prisma.transaction.findMany
      .mockResolvedValueOnce([
        {
          id: "tx-buy",
          bookings: [
            {
              id: "h-buy",
              accountId: "account-aapl",
              date: new Date("2026-02-05T00:00:00.000Z"),
              value: 10,
              unit: Unit.SECURITY,
              currency: null,
              cryptocurrency: null,
              symbol: "AAPL",
              tradeCurrency: "USD",
              account: { type: AccountType.ASSET, equityAccountSubtype: null },
            },
            {
              id: "c-buy",
              accountId: "account-cash",
              date: new Date("2026-02-05T00:00:00.000Z"),
              value: -1000,
              unit: Unit.CURRENCY,
              currency: "CHF",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
              account: { type: AccountType.ASSET, equityAccountSubtype: null },
            },
          ],
        },
        {
          id: "tx-sell",
          bookings: [
            {
              id: "h-sell",
              accountId: "account-aapl",
              date: new Date("2026-02-12T00:00:00.000Z"),
              value: -4,
              unit: Unit.SECURITY,
              currency: null,
              cryptocurrency: null,
              symbol: "AAPL",
              tradeCurrency: "USD",
              account: { type: AccountType.ASSET, equityAccountSubtype: null },
            },
            {
              id: "c-sell",
              accountId: "account-cash",
              date: new Date("2026-02-12T00:00:00.000Z"),
              value: 480,
              unit: Unit.CURRENCY,
              currency: "CHF",
              cryptocurrency: null,
              symbol: null,
              tradeCurrency: null,
              account: { type: AccountType.ASSET, equityAccountSubtype: null },
            },
          ],
        },
      ])
      .mockResolvedValueOnce([]);

    convertBookingValueToReference.mockImplementation(async ({ id }) => {
      if (id === "h-buy") return 1000;
      if (id === "c-buy") return -1000;
      if (id === "h-sell") return -480;
      if (id === "c-sell") return 480;
      return null;
    });
    getUnitToReferenceExchangeRate.mockResolvedValue(130);

    const response = await getPeriodGainLossReconciliation({
      data: {
        accountBookId: "book-1",
        accountId: "account-aapl",
        period: "2026-02",
      },
    });

    expect(response).not.toBeNull();
    expect(response?.target).toMatchObject({
      accountId: "account-aapl",
      accountName: "AAPL Trading",
      isVirtual: false,
      unitLabel: "AAPL (USD)",
    });
    expect(response?.summary).toEqual({
      realizedGainLoss: 80,
      unrealizedGainLoss: 180,
      totalGainLoss: 260,
    });
    expect(response?.realizedEvents).toHaveLength(2);
    expect(response?.unrealizedOpenLots).toMatchObject([
      {
        quantity: 6,
        unitCostInReference: 100,
        periodEndRate: 130,
        unrealizedGainLoss: 180,
      },
    ]);
    expect(response?.diagnostics.skippedCount).toBe(0);
  });

  it("returns full reconciliation for virtual transfer-clearing accounts", async () => {
    prisma.account.findFirst.mockResolvedValue(null);
    prisma.booking.findMany.mockResolvedValue([
      {
        id: "tc-open",
        transactionId: "tx-open",
        date: new Date("2026-01-31T00:00:00.000Z"),
        value: -10,
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "AAPL",
        tradeCurrency: "USD",
      },
      {
        id: "tc-close",
        transactionId: "tx-close",
        date: new Date("2026-02-10T00:00:00.000Z"),
        value: 4,
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "AAPL",
        tradeCurrency: "USD",
      },
    ]);

    convertBookingValueToReference.mockImplementation(async ({ value, id }) => {
      if (id === "tc-close") {
        return 520;
      }
      return value;
    });
    getUnitToReferenceExchangeRate.mockImplementation(async ({ date }) => {
      if (date.toISOString() === "2026-01-31T00:00:00.000Z") {
        return 100;
      }
      if (date.toISOString() === "2026-02-28T00:00:00.000Z") {
        return 110;
      }
      return 110;
    });

    const response = await getPeriodGainLossReconciliation({
      data: {
        accountBookId: "book-1",
        accountId: "virtual:transfer-clearing:account:security:AAPL:USD",
        period: "2026-02",
      },
    });

    expect(response).not.toBeNull();
    expect(response?.target).toMatchObject({
      isVirtual: true,
      accountName: "AAPL:USD",
      unitLabel: "AAPL (USD)",
    });
    expect(response?.summary).toEqual({
      realizedGainLoss: 120,
      unrealizedGainLoss: 60,
      totalGainLoss: 180,
    });
    expect(response?.realizedEvents).toHaveLength(1);
    expect(response?.unrealizedOpenLots).toMatchObject([
      {
        quantity: 6,
        unitCostInReference: 100,
        periodEndRate: 110,
        unrealizedGainLoss: 60,
      },
    ]);
  });

  it("returns null for unsupported targets", async () => {
    prisma.account.findFirst.mockResolvedValue(null);

    const response = await getPeriodGainLossReconciliation({
      data: {
        accountBookId: "book-1",
        accountId: "unknown-account",
        period: "2026-02",
      },
    });

    expect(response).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType, Unit } from "../../.prisma-client/enums";

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
    findMany: vi.fn(),
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

vi.mock("../../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId,
}));

vi.mock("../../prisma.server", () => ({
  prisma,
}));

vi.mock("./period-conversion", () => ({
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
}));

import { getPeriodGainLossReconciliation } from "./period-gain-loss-reconciliation";

describe("getPeriodGainLossReconciliation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));

    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });

    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.groupBy.mockResolvedValue([]);
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.account.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
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
    const sellEvent = response?.realizedEvents.find(
      (event) => event.bookingId === "h-sell",
    );
    expect(sellEvent).toBeDefined();
    expect(sellEvent?.pricing).toMatchObject({
      source: "directConversion",
      marketReferenceAmount: -480,
      residualAllocationAmount: 0,
      effectiveReferenceAmount: -480,
    });
    expect(sellEvent?.lotMatches).toMatchObject([
      {
        acquisitionBookingId: "h-buy",
        matchedQuantity: 4,
        lotUnitCostInReference: 100,
        executionUnitPriceInReference: 120,
        realizedGainLossDelta: 80,
        runningEventRealizedGainLoss: 80,
      },
    ]);
    expect(
      sellEvent?.lotMatches.reduce(
        (sum, lotMatch) => sum + lotMatch.realizedGainLossDelta,
        0,
      ),
    ).toBe(sellEvent?.realizedGainLossDelta);
    expect(sellEvent?.rounding.roundedRealizedGainLossDelta).toBe(
      sellEvent?.realizedGainLossDelta,
    );
    expect(sellEvent?.rounding.roundedRunningRealizedGainLoss).toBe(
      sellEvent?.runningRealizedGainLoss,
    );
    expect(response?.unrealizedOpenLots).toMatchObject([
      {
        quantity: 6,
        unitCostInReference: 100,
        periodEndRate: 130,
        unrealizedGainLoss: 180,
        runningUnrealizedGainLoss: 180,
      },
    ]);
    expect(response?.diagnostics.skippedCount).toBe(0);
  });

  it("keeps same-unit internal transfers non-realizing in real-account reconciliation", async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: "account-aapl",
      name: "AAPL Trading",
      unit: Unit.SECURITY,
      currency: null,
      cryptocurrency: null,
      symbol: "AAPL",
      tradeCurrency: "USD",
    });
    prisma.account.findMany.mockResolvedValue([
      {
        id: "account-aapl",
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "AAPL",
        tradeCurrency: "USD",
      },
      {
        id: "account-aapl-2",
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "AAPL",
        tradeCurrency: "USD",
      },
      {
        id: "account-cash",
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
      },
    ]);
    prisma.booking.groupBy.mockResolvedValue([
      { accountId: "account-aapl", _sum: { value: 10 } },
      { accountId: "account-aapl-2", _sum: { value: 0 } },
    ]);
    prisma.transaction.findMany
      .mockResolvedValueOnce([
        {
          id: "tx-transfer",
          description: "Internal transfer",
          bookings: [
            {
              id: "h-transfer-out",
              description: "Transfer out",
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
              id: "h-transfer-in",
              description: "Transfer in",
              accountId: "account-aapl-2",
              date: new Date("2026-02-12T00:00:00.000Z"),
              value: 4,
              unit: Unit.SECURITY,
              currency: null,
              cryptocurrency: null,
              symbol: "AAPL",
              tradeCurrency: "USD",
              account: { type: AccountType.ASSET, equityAccountSubtype: null },
            },
          ],
        },
      ])
      .mockResolvedValueOnce([]);

    getUnitToReferenceExchangeRate.mockImplementation(async ({ date }) => {
      if (date.toISOString() === "2026-01-31T00:00:00.000Z") {
        return 100;
      }
      if (date.toISOString() === "2026-02-28T00:00:00.000Z") {
        return 110;
      }
      return null;
    });

    const response = await getPeriodGainLossReconciliation({
      data: {
        accountBookId: "book-1",
        accountId: "account-aapl",
        period: "2026-02",
      },
    });

    expect(response).not.toBeNull();
    expect(response?.summary).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 60,
      totalGainLoss: 60,
    });
    expect(response?.realizedEvents).toEqual([]);
    expect(response?.unrealizedOpenLots).toMatchObject([
      {
        quantity: 6,
        unitCostInReference: 100,
        periodEndRate: 110,
        unrealizedGainLoss: 60,
      },
    ]);
    expect(convertBookingValueToReference).not.toHaveBeenCalled();
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
    expect(response?.realizedEvents[0]).toMatchObject({
      pricing: {
        source: "directConversion",
        marketReferenceAmount: -520,
        residualAllocationAmount: 0,
        effectiveReferenceAmount: -520,
      },
      lotMatches: [
        {
          acquisitionBookingId: "opening:security:AAPL:USD",
          matchedQuantity: 4,
          lotUnitCostInReference: 100,
          executionUnitPriceInReference: 130,
          realizedGainLossDelta: 120,
          runningEventRealizedGainLoss: 120,
        },
      ],
    });
    expect(response?.unrealizedOpenLots).toMatchObject([
      {
        quantity: 6,
        unitCostInReference: 100,
        periodEndRate: 110,
        unrealizedGainLoss: 60,
        runningUnrealizedGainLoss: 60,
      },
    ]);
  });

  it("marks residual-adjusted event pricing metadata", async () => {
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
              value: 500,
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
      if (id === "c-sell") return 500;
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

    const residualAdjustedEvent = response?.realizedEvents.find(
      (event) => event.pricing.source === "residualAdjusted",
    );
    expect(residualAdjustedEvent?.pricing).toMatchObject({
      source: "residualAdjusted",
      marketReferenceAmount: -480,
      residualAllocationAmount: -20,
      effectiveReferenceAmount: -500,
    });
    expect(residualAdjustedEvent?.realizedGainLossDelta).toBe(100);
  });

  it("exposes raw and rounded realized-delta values consistently", async () => {
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
              value: 3,
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
              value: -1,
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
              value: 400,
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
      if (id === "h-sell") return -400;
      if (id === "c-sell") return 400;
      return null;
    });
    getUnitToReferenceExchangeRate.mockResolvedValue(350);

    const response = await getPeriodGainLossReconciliation({
      data: {
        accountBookId: "book-1",
        accountId: "account-aapl",
        period: "2026-02",
      },
    });
    expect(response).not.toBeNull();
    const sellEvent = response?.realizedEvents.find(
      (event) => event.bookingId === "h-sell",
    );
    expect(sellEvent).toBeDefined();
    expect(sellEvent?.rounding.rawRealizedGainLossDelta).toBeCloseTo(
      66.6666667,
      6,
    );
    expect(sellEvent?.rounding.roundedRealizedGainLossDelta).toBe(66.67);
    expect(sellEvent?.rounding.roundedRealizedGainLossDelta).toBe(
      sellEvent?.realizedGainLossDelta,
    );
    expect(sellEvent?.rounding.roundedRunningRealizedGainLoss).toBe(
      sellEvent?.runningRealizedGainLoss,
    );
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

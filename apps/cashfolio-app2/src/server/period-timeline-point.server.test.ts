import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";

const prisma = vi.hoisted(() => ({
  accountBook: {
    findUniqueOrThrow: vi.fn(),
  },
  accountGroup: {
    findMany: vi.fn(),
  },
  account: {
    findMany: vi.fn(),
  },
  booking: {
    findMany: vi.fn(),
    groupBy: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
  },
}));

const convertBookingValueToReference = vi.hoisted(() => vi.fn());
const getUnitToReferenceExchangeRate = vi.hoisted(() => vi.fn());
const initializeHoldingGainLossState = vi.hoisted(() => vi.fn());
const applyHoldingTransactionsToGainLossState = vi.hoisted(() => vi.fn());
const finalizeHoldingGainLossState = vi.hoisted(() => vi.fn());
const loadTransferClearingUnitBuckets = vi.hoisted(() => vi.fn());
const computeTransferClearingGainLossSplit = vi.hoisted(() => vi.fn());

vi.mock("../prisma.server", () => ({
  prisma,
}));

vi.mock("./period-conversion", () => ({
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
}));

vi.mock("./period-overview-holdings", () => ({
  initializeHoldingGainLossState,
  applyHoldingTransactionsToGainLossState,
  finalizeHoldingGainLossState,
}));

vi.mock("./period-transfer-clearing", () => ({
  loadTransferClearingUnitBuckets,
  computeTransferClearingGainLossSplit,
}));

import {
  loadPeriodTimelinePoint,
  loadPeriodTimelinePointContext,
  type PeriodTimelinePointContext,
} from "./period-timeline-point.server";

function createContext(args: {
  startDate: string;
  holdingAccountsResolved?: PeriodTimelinePointContext["holdingAccountsResolved"];
}): PeriodTimelinePointContext {
  return {
    referenceCurrency: "CHF",
    accountBookStartDate: new Date(args.startDate),
    holdingAccountsResolved: args.holdingAccountsResolved ?? [],
  };
}

function createEquityBooking(args: {
  id: string;
  value: number;
  subtype: EquityAccountSubtype;
}) {
  return {
    id: args.id,
    value: args.value,
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    date: new Date("2026-02-10T00:00:00.000Z"),
    account: {
      id: `equity-${args.id}`,
      name: `Equity ${args.id}`,
      groupId: null,
      equityAccountSubtype: args.subtype,
    },
  };
}

describe("loadPeriodTimelinePoint", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));

    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.accountGroup.findMany.mockResolvedValue([]);
    prisma.account.findMany.mockResolvedValue([]);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.groupBy.mockResolvedValue([]);
    prisma.transaction.findMany.mockResolvedValue([]);

    convertBookingValueToReference.mockImplementation(
      async ({ value }) => value,
    );
    getUnitToReferenceExchangeRate.mockResolvedValue(1);

    initializeHoldingGainLossState.mockResolvedValue({ state: "holding" });
    applyHoldingTransactionsToGainLossState.mockResolvedValue(undefined);
    finalizeHoldingGainLossState.mockResolvedValue({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
    });

    loadTransferClearingUnitBuckets.mockResolvedValue([]);
    computeTransferClearingGainLossSplit.mockResolvedValue({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("builds normalized context and filters to convertible holding accounts", async () => {
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      referenceCurrency: "chf",
      startDate: new Date("2026-02-12T18:45:00.000Z"),
    });
    prisma.account.findMany.mockResolvedValue([
      {
        id: "holding-security",
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "AAPL",
        tradeCurrency: "USD",
      },
      {
        id: "cash-reference",
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
      },
      {
        id: "liability-foreign",
        unit: Unit.CURRENCY,
        currency: "USD",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
      },
    ]);

    const result = await loadPeriodTimelinePointContext({
      accountBookId: "book-ctx",
    });

    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "book-ctx" },
      select: {
        referenceCurrency: true,
        startDate: true,
      },
    });
    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: {
        accountBookId: "book-ctx",
        type: {
          in: [AccountType.ASSET, AccountType.LIABILITY],
        },
      },
      select: {
        id: true,
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
      },
    });
    expect(result.referenceCurrency).toBe("CHF");
    expect(result.accountBookStartDate.toISOString()).toBe(
      "2026-02-12T00:00:00.000Z",
    );
    expect(result.holdingAccountsResolved.map((account) => account.id)).toEqual(
      ["holding-security", "liability-foreign"],
    );
  });

  test("zeros total return for periods before account-book start", async () => {
    vi.setSystemTime(new Date("2026-01-10T12:00:00.000Z"));

    const result = await loadPeriodTimelinePoint({
      accountBookId: "book-1",
      period: "2026-01",
      context: createContext({
        startDate: "2026-01-20T00:00:00.000Z",
      }),
    });

    expect(result.totalReturn).toBe(0);
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
    expect(prisma.booking.groupBy).not.toHaveBeenCalled();
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    expect(loadTransferClearingUnitBuckets).not.toHaveBeenCalled();
    expect(computeTransferClearingGainLossSplit).not.toHaveBeenCalled();
  });

  test("includes explicit gain/loss in total return", async () => {
    prisma.booking.findMany
      .mockResolvedValueOnce([
        createEquityBooking({
          id: "gainloss",
          value: -25,
          subtype: EquityAccountSubtype.GAIN_LOSS,
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await loadPeriodTimelinePoint({
      accountBookId: "book-2",
      period: "2026-02",
      context: createContext({
        startDate: "2026-01-01T00:00:00.000Z",
      }),
    });

    expect(result.totalReturn).toBe(25);
  });

  test("matches period-overview total-return semantics", async () => {
    prisma.booking.findMany
      .mockResolvedValueOnce([
        createEquityBooking({
          id: "income",
          value: -120,
          subtype: EquityAccountSubtype.INCOME,
        }),
        createEquityBooking({
          id: "expense",
          value: 20,
          subtype: EquityAccountSubtype.EXPENSE,
        }),
        createEquityBooking({
          id: "explicit",
          value: -30,
          subtype: EquityAccountSubtype.GAIN_LOSS,
        }),
      ])
      .mockResolvedValueOnce([]);

    finalizeHoldingGainLossState.mockResolvedValue({
      realizedGainLoss: 12,
      unrealizedGainLoss: -2,
    });
    computeTransferClearingGainLossSplit.mockResolvedValue({
      realizedGainLoss: 5,
      unrealizedGainLoss: 3,
    });

    const result = await loadPeriodTimelinePoint({
      accountBookId: "book-3",
      period: "2026-02",
      context: createContext({
        startDate: "2026-01-01T00:00:00.000Z",
      }),
    });

    expect(result.totalReturn).toBe(138);
    expect(finalizeHoldingGainLossState).not.toHaveBeenCalled();
    expect(computeTransferClearingGainLossSplit).toHaveBeenCalledTimes(1);
  });
});

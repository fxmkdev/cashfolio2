import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toMoney, type MoneyInput } from "../../../shared/money";
import { AccountType, Unit } from "../../../.prisma-client/enums";

import type {
  PeriodBaseData,
  PeriodBaseHoldingTransaction,
} from "../base-data/period-base-data-types";
import type { TransferClearingBooking } from "../transfer-clearing/period-transfer-clearing-types";
import { filterConvertibleHoldingAccounts } from "../period-helpers";
import {
  getPeriodEndExclusive,
  resolvePeriodSelection,
} from "../period-selection";
import { addUtcDays } from "../../../shared/date";

let baseData: PeriodBaseData;

function setAccounts(
  accounts: (Partial<PeriodBaseData["baseAssetLiabilityAccounts"][number]> & {
    id: string;
  })[],
) {
  baseData.baseAssetLiabilityAccounts = accounts.map((account) => ({
    name: "AAPL Trading",
    type: AccountType.BALANCE,
    groupId: null,
    assetClassId: null,
    isCashAccount: false,
    unit: null,
    currency: null,
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    ...account,
  }));
  baseData.holdingAccountsResolved = filterConvertibleHoldingAccounts(
    baseData.baseAssetLiabilityAccounts,
    baseData.referenceCurrency,
  );
}

type FixtureBooking = Omit<
  PeriodBaseHoldingTransaction["bookings"][number],
  "value" | "accountType" | "equityAccountSubtype"
> & {
  value: MoneyInput;
  account: { type: AccountType; equityAccountSubtype: null };
};

function setHoldingTransactions(
  transactions: {
    id: string;
    description?: string;
    bookings: FixtureBooking[];
  }[],
) {
  baseData.holdingTransactions = transactions.map((transaction) => ({
    id: transaction.id,
    bookings: transaction.bookings.map(({ account, value, ...booking }) => ({
      ...booking,
      value: toMoney(value),
      transactionId: transaction.id,
      transactionDescription: transaction.description,
      accountType: account.type,
      equityAccountSubtype: account.equityAccountSubtype,
    })),
  }));
}

function setTransferClearingBookings(
  bookings: (Omit<TransferClearingBooking, "value"> & { value: MoneyInput })[],
) {
  baseData.transferClearingUnitBuckets = [
    {
      unitKey: "security:AAPL:USD",
      unitLabel: "AAPL:USD",
      unitType: "security",
      unit: Unit.SECURITY,
      currency: null,
      cryptocurrency: null,
      symbol: "AAPL",
      tradeCurrency: "USD",
      isNonReferenceUnit: true,
      rawBalance: toMoney(-6),
      bookings: bookings.map((booking) => ({
        ...booking,
        value: toMoney(booking.value),
      })),
    },
  ];
}

const createServerFn = vi.hoisted(() =>
  vi.fn(() => {
    let validate: ((data: unknown) => unknown) | undefined;
    const chain = {
      validator: vi.fn((validator: (data: unknown) => unknown) => {
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

vi.mock("../../../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId,
}));

vi.mock("../../../prisma.server", () => ({
  prisma,
}));

vi.mock("../period-conversion", () => ({
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
}));

const getOrLoadPeriodBaseData = vi.hoisted(() => vi.fn());
const loadAccountGainLossSources = vi.hoisted(() => vi.fn());
vi.mock("../cache/period-base-data-cache", () => ({ getOrLoadPeriodBaseData }));
vi.mock("./period-account-gain-loss-sources", () => ({
  loadAccountGainLossSources,
}));

import {
  getPeriodGainLossReconciliation,
  getPeriodGainLossReconciliationPageData,
} from "./period-gain-loss-reconciliation";

describe("getPeriodGainLossReconciliation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));

    const selection = resolvePeriodSelection({
      periodValue: "2026-02",
      firstBookingDate: new Date("2026-01-01"),
    });
    baseData = {
      accountBookId: "book-1",
      periodValue: "2026-02",
      referenceCurrency: "CHF",
      selection: {
        ...selection,
        queryEndExclusive: getPeriodEndExclusive(selection.to),
        initialHoldingDate: addUtcDays(selection.from, -1),
        minPeriodDate: new Date("2026-01-01"),
        isBeforeAccountBookStart: false,
      },
      baseAssetLiabilityAccounts: [],
      holdingAccountsResolved: [],
      initialHoldingBalances: [],
      holdingTransactions: [],
      transferClearingUnitBuckets: [],
      allAccountGroups: [],
      endOfPeriodRawBalances: [],
      equityBookings: [],
      explicitCounterparts: [],
      executionResidualTransactions: [],
      cashFlowTransactions: [],
      hasCashAccounts: false,
    };
    getOrLoadPeriodBaseData.mockImplementation(async () => baseData);
    loadAccountGainLossSources.mockResolvedValue({
      node: undefined,
      contribution: undefined,
      recordedAdjustments: [],
      executionResiduals: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    // No settings, account, balance, transaction, or transfer-clearing rereads
    // may escape the snapshot loader, even while external valuation is pending.
    for (const model of Object.values(prisma)) {
      for (const query of Object.values(model))
        expect(query).not.toHaveBeenCalled();
    }
  });

  it.each(["reference-currency", "unattributed"])(
    "serializes recorded %s explanations without requiring a calculated holding",
    async (kind) => {
      const accountId =
        kind === "reference-currency"
          ? "chf-portfolio"
          : "explicit-unattributed:multiple-counterparts";
      const identity = {
        id: accountId,
        name: "Recorded Portfolio",
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
      };
      const contribution = {
        ...identity,
        accountId,
        accountName: identity.name,
        currency: kind === "reference-currency" ? "USD" : "CHF",
        sourceKind: "EXPLICIT",
        realizedGainLoss: toMoney("12.34"),
        unrealizedGainLoss: toMoney(0),
      };
      setAccounts(kind === "reference-currency" ? [identity] : []);
      loadAccountGainLossSources.mockResolvedValue({
        contribution,
        node: {
          label: identity.name,
          realizedGainLoss: toMoney("12.34"),
          unrealizedGainLoss: toMoney(0),
          totalGainLoss: toMoney("12.34"),
          account: {
            kind: kind === "reference-currency" ? "account" : "unattributed",
            calculatedRealizedGainLoss: toMoney(0),
            recordedGainLoss: toMoney("12.34"),
            explanation: "Classification is unavailable.",
          },
        },
        recordedAdjustments: [
          {
            id: "booking",
            date: "2026-02-03T00:00:00.000Z",
            transactionId: "tx",
            description: "Manual adjustment",
            amount: toMoney("12.34"),
          },
        ],
        executionResiduals: [],
      });
      const response = await getPeriodGainLossReconciliation({
        data: { accountBookId: "book-1", accountId, period: "2026-02" },
      });
      expect(response?.summary).toEqual({
        realizedGainLoss: 12.34,
        unrealizedGainLoss: 0,
        totalGainLoss: 12.34,
      });
      expect(response?.target).toEqual({
        accountId,
        accountName: identity.name,
        isVirtual: kind === "unattributed",
        unit: Unit.CURRENCY,
        unitLabel: "CHF",
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
      });
      expect(response?.sources).toMatchObject({
        calculatedRealizedGainLoss: 0,
        recordedGainLoss: 12.34,
        attributionExplanation: "Classification is unavailable.",
        recordedAdjustments: [{ transactionId: "tx", amount: 12.34 }],
      });
      expect(response?.realizedEvents).toEqual([]);
      expect(
        JSON.parse(JSON.stringify(response)).sources.recordedAdjustments[0]
          .amount,
      ).toBe(12.34);
    },
  );

  it("keeps snapshot totals and explanation rows consistent across a concurrent edit", async () => {
    setAccounts([
      {
        id: "account-aapl",
        name: "AAPL Trading",
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "AAPL",
        tradeCurrency: "USD",
      },
    ]);

    setHoldingTransactions([
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
            account: {
              type: AccountType.BALANCE,
              equityAccountSubtype: null,
            },
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
            account: {
              type: AccountType.BALANCE,
              equityAccountSubtype: null,
            },
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
            account: {
              type: AccountType.BALANCE,
              equityAccountSubtype: null,
            },
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
            account: {
              type: AccountType.BALANCE,
              equityAccountSubtype: null,
            },
          },
        ],
      },
    ]);

    const actualSources = await vi.importActual<
      typeof import("./period-account-gain-loss-sources")
    >("./period-account-gain-loss-sources");
    loadAccountGainLossSources.mockImplementationOnce(
      actualSources.loadAccountGainLossSources,
    );
    convertBookingValueToReference.mockImplementation(
      async ({ value, unit, date }) =>
        toMoney(value).times(
          unit === Unit.SECURITY ? (date.getUTCDate() === 5 ? 100 : 120) : 1,
        ),
    );
    let signalValuationStarted!: () => void;
    const valuationStarted = new Promise<void>((resolve) => {
      signalValuationStarted = resolve;
    });
    let resumeValuation!: () => void;
    const valuationResumed = new Promise<void>((resolve) => {
      resumeValuation = resolve;
    });
    getUnitToReferenceExchangeRate.mockImplementation(async () => {
      signalValuationStarted();
      await valuationResumed;
      return toMoney(130);
    });

    const pendingResponse = getPeriodGainLossReconciliation({
      data: {
        accountBookId: "book-1",
        accountId: "account-aapl",
        period: "2026-02",
      },
    });

    await valuationStarted;
    // A committed edit changes the live book while the snapshot's valuation
    // is pending. Neither settings nor explanation inputs may be reread.
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      referenceCurrency: "USD",
      startDate: new Date("2026-02-15"),
    });
    prisma.account.findFirst.mockResolvedValue(null);
    prisma.account.findMany.mockResolvedValue([]);
    prisma.booking.groupBy.mockResolvedValue([]);
    prisma.transaction.findMany.mockResolvedValue([]);
    vi.setSystemTime(new Date("2026-04-01T12:00:00.000Z"));
    resumeValuation();
    const response = await pendingResponse;
    expect(getOrLoadPeriodBaseData).toHaveBeenCalledExactlyOnceWith({
      accountBookId: "book-1",
      period: "2026-02",
    });
    expect(response).toMatchObject({
      referenceCurrency: "CHF",
      selectedPeriodValue: "2026-02",
      selectedPeriodLabel: "February 2026",
      periodBounds: { minBookingDate: "2026-01-01T00:00:00.000Z" },
      periodDateRange: {
        from: "2026-02-01T00:00:00.000Z",
        to: "2026-02-28T00:00:00.000Z",
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
    setAccounts([
      {
        id: "account-aapl",
        name: "AAPL Trading",
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "AAPL",
        tradeCurrency: "USD",
      },
    ]);
    setAccounts([
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
    baseData.initialHoldingBalances = [
      { accountId: "account-aapl", _sum: { value: 10 } },
      { accountId: "account-aapl-2", _sum: { value: 0 } },
    ].map(({ accountId, _sum }) => ({
      accountId,
      rawBalance: toMoney(_sum.value),
    }));
    setHoldingTransactions([
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
            account: {
              type: AccountType.BALANCE,
              equityAccountSubtype: null,
            },
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
            account: {
              type: AccountType.BALANCE,
              equityAccountSubtype: null,
            },
          },
        ],
      },
    ]);

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
    setAccounts([]);
    setTransferClearingBookings([
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

    const actualSources = await vi.importActual<
      typeof import("./period-account-gain-loss-sources")
    >("./period-account-gain-loss-sources");
    loadAccountGainLossSources.mockImplementationOnce(
      actualSources.loadAccountGainLossSources,
    );
    convertBookingValueToReference.mockImplementation(async ({ value }) =>
      toMoney(value).times(130),
    );
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
    setAccounts([
      {
        id: "account-aapl",
        name: "AAPL Trading",
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "AAPL",
        tradeCurrency: "USD",
      },
    ]);
    setHoldingTransactions([
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
            account: {
              type: AccountType.BALANCE,
              equityAccountSubtype: null,
            },
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
            account: {
              type: AccountType.BALANCE,
              equityAccountSubtype: null,
            },
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
            account: {
              type: AccountType.BALANCE,
              equityAccountSubtype: null,
            },
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
            account: {
              type: AccountType.BALANCE,
              equityAccountSubtype: null,
            },
          },
        ],
      },
    ]);
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
    setAccounts([
      {
        id: "account-aapl",
        name: "AAPL Trading",
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "AAPL",
        tradeCurrency: "USD",
      },
    ]);
    setHoldingTransactions([
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
            account: {
              type: AccountType.BALANCE,
              equityAccountSubtype: null,
            },
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
            account: {
              type: AccountType.BALANCE,
              equityAccountSubtype: null,
            },
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
            account: {
              type: AccountType.BALANCE,
              equityAccountSubtype: null,
            },
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
            account: {
              type: AccountType.BALANCE,
              equityAccountSubtype: null,
            },
          },
        ],
      },
    ]);
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
    setAccounts([]);

    const response = await getPeriodGainLossReconciliation({
      data: {
        accountBookId: "book-1",
        accountId: "unknown-account",
        period: "2026-02",
      },
    });

    expect(response).toBeNull();
  });

  it("returns the report period label for unsupported targets", async () => {
    setAccounts([]);

    const response = await getPeriodGainLossReconciliationPageData({
      data: {
        accountBookId: "book-1",
        accountId: "unknown-account",
        period: "2026-02",
        locale: "de-CH",
      },
    });

    expect(response).toEqual({
      reportPeriodValue: "2026-02",
      reportPeriodLabel: "Februar 2026",
      reconciliation: null,
    });
  });
});

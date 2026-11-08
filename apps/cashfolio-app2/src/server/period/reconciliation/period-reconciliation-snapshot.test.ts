import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType, Unit } from "../../../.prisma-client/enums";
import { toMoney } from "../../../shared/money";
import {
  cleanupReconciliationFixture,
  convertBookingValueToReference,
  getOrLoadPeriodBaseData,
  getPeriodGainLossReconciliation,
  getUnitToReferenceExchangeRate,
  loadAccountGainLossSources,
  prisma,
  resetReconciliationFixture,
  setAccounts,
  setHoldingTransactions,
} from "./period-gain-loss-reconciliation.test-support";

beforeEach(resetReconciliationFixture);
afterEach(cleanupReconciliationFixture);

describe("getPeriodGainLossReconciliation", () => {
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
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountType, Unit } from "../../../.prisma-client/enums";
import {
  cleanupReconciliationFixture,
  convertBookingValueToReference,
  getPeriodGainLossReconciliation,
  getUnitToReferenceExchangeRate,
  resetReconciliationFixture,
  setAccounts,
  setHoldingTransactions,
} from "./period-gain-loss-reconciliation.test-support";

beforeEach(resetReconciliationFixture);
afterEach(cleanupReconciliationFixture);

describe("getPeriodGainLossReconciliation", () => {
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
});

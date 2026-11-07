import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountType, Unit } from "../../../.prisma-client/enums";
import { toMoney } from "../../../shared/money";
import {
  baseData,
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
});

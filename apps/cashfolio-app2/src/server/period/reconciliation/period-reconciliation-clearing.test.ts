import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Unit } from "../../../.prisma-client/enums";
import { toMoney } from "../../../shared/money";
import {
  cleanupReconciliationFixture,
  convertBookingValueToReference,
  getPeriodGainLossReconciliation,
  getUnitToReferenceExchangeRate,
  loadAccountGainLossSources,
  resetReconciliationFixture,
  setAccounts,
  setTransferClearingBookings,
} from "./period-gain-loss-reconciliation.test-support";

beforeEach(resetReconciliationFixture);
afterEach(cleanupReconciliationFixture);

describe("getPeriodGainLossReconciliation", () => {
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
});

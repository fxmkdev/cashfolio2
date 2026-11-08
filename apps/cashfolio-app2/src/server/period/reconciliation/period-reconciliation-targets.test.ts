import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Unit } from "../../../.prisma-client/enums";
import { toMoney } from "../../../shared/money";
import {
  cleanupReconciliationFixture,
  getPeriodGainLossReconciliation,
  getPeriodGainLossReconciliationPageData,
  loadAccountGainLossSources,
  resetReconciliationFixture,
  setAccounts,
} from "./period-gain-loss-reconciliation.test-support";

beforeEach(resetReconciliationFixture);
afterEach(cleanupReconciliationFixture);

describe("getPeriodGainLossReconciliation", () => {
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

import { describe, expect, it } from "vitest";
import type { PeriodGainLossReconciliation } from "@/server/period-gain-loss-reconciliation";
import { getGainLossReconciliationPageTitle } from "./-page-title";

describe("getGainLossReconciliationPageTitle", () => {
  it("uses the fallback title when reconciliation data is unavailable", () => {
    expect(getGainLossReconciliationPageTitle(null)).toBe(
      "Gain/Loss Reconciliation",
    );
  });

  it("matches the account and unit heading when reconciliation data exists", () => {
    const reconciliation = {
      target: {
        accountName: "Brokerage",
        unitLabel: "AAPL",
      },
    } as PeriodGainLossReconciliation;

    expect(getGainLossReconciliationPageTitle(reconciliation)).toBe(
      "Brokerage · AAPL",
    );
  });
});

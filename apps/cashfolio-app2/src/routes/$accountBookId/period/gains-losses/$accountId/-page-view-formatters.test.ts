import { describe, expect, it } from "vitest";
import {
  formatDescription,
  getLedgerActionTooltipLabel,
  toEventSide,
} from "./-page-view-formatters";
import type { RealizedEventRow } from "./-page-view-types";

function asEventWithQuantity(quantity: number): RealizedEventRow {
  return { quantity } as RealizedEventRow;
}

describe("page view formatters", () => {
  it("maps event quantity to side", () => {
    expect(toEventSide(asEventWithQuantity(1))).toBe("buy");
    expect(toEventSide(asEventWithQuantity(-1))).toBe("sell");
    expect(toEventSide(asEventWithQuantity(0))).toBe("flat");
  });

  it("normalizes empty descriptions", () => {
    expect(formatDescription(null)).toBe("—");
    expect(formatDescription("   ")).toBe("—");
    expect(formatDescription("Trade A")).toBe("Trade A");
  });

  it("selects ledger tooltip label from capability and target type", () => {
    expect(
      getLedgerActionTooltipLabel({
        canOpenLedger: true,
        isVirtualTarget: false,
      }),
    ).toBe("Open in ledger");
    expect(
      getLedgerActionTooltipLabel({
        canOpenLedger: false,
        isVirtualTarget: true,
      }),
    ).toBe("Virtual accounts have no ledger");
    expect(
      getLedgerActionTooltipLabel({
        canOpenLedger: false,
        isVirtualTarget: false,
      }),
    ).toBe("No ledger transaction");
  });
});

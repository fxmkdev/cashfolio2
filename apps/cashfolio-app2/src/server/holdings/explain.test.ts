import { describe, expect, it } from "vitest";
import { toMoney } from "../../shared/money";
import {
  addRunningUnrealizedGainLoss,
  parseAcquisitionSortKey,
  toRoundedOpenLot,
  toRoundedRealizedEvent,
} from "./explain";
import type { HoldingExecutionExplainInput } from "./types";

const acquisitionSortKey = "2026-02-01T00:00:00.000Z::purchase::1";
const event: HoldingExecutionExplainInput = {
  portion: "transfer-fallback",
  bookingId: "sale",
  transactionId: "trade",
  date: new Date("2026-02-10T00:00:00.000Z"),
  quantity: toMoney("-0.123456789123456789"),
  pricingSource: "marketFallback",
  marketReferenceAmount: null,
  residualAllocationAmount: toMoney("0.005"),
  effectiveReferenceAmount: toMoney("-10.125"),
  executionUnitPriceInReference: toMoney("82.01234567890123456789"),
  realizedGainLossDelta: toMoney("0.125"),
  runningRealizedGainLoss: toMoney("0.135"),
  lotMatches: [
    {
      acquisitionSortKey,
      matchedQuantity: toMoney("0.123456789123456789"),
      lotUnitCostInReference: toMoney("81.01234567890123456789"),
      executionUnitPriceInReference: toMoney("82.01234567890123456789"),
      realizedGainLossDelta: toMoney("0.125"),
      runningEventRealizedGainLoss: toMoney("0.125"),
    },
  ],
};

describe("shared holding explain mapping", () => {
  it("keeps account detail precision and period half-even rounding distinct", () => {
    const exact = toRoundedRealizedEvent(event, false);
    const rounded = toRoundedRealizedEvent(event);

    expect(exact.effectiveReferenceAmount.toString()).toBe("-10.125");
    expect(exact.executionUnitPriceInReference.toString()).toBe(
      "82.01234567890123456789",
    );
    expect(exact.lotMatches[0]!.matchedQuantity.toString()).toBe(
      "0.123456789123456789",
    );
    expect(rounded.effectiveReferenceAmount.toString()).toBe("-10.12");
    expect(rounded.realizedGainLossDelta.toString()).toBe("0.12");
    expect(rounded.runningRealizedGainLoss.toString()).toBe("0.14");
    expect(rounded.lotMatches[0]!.matchedQuantity.toString()).toBe("0.12");
    expect(rounded.quantity.toString()).toBe("-0.123456789123456789");
    expect(rounded.rounding.rawEffectiveReferenceAmount.toString()).toBe(
      "-10.125",
    );
    expect(rounded.pricing.marketReferenceAmount).toBeNull();
    expect(rounded.pricing.residualAllocationAmount.toString()).toBe("0");
    expect(event.effectiveReferenceAmount.toString()).toBe("-10.125");
  });

  it("retains acquisition identity and distinct execution portions in both modes", () => {
    expect(parseAcquisitionSortKey(acquisitionSortKey)).toEqual({
      acquisitionDate: "2026-02-01T00:00:00.000Z",
      acquisitionBookingId: "purchase",
    });
    for (const roundAmounts of [true, false]) {
      const fallback = toRoundedRealizedEvent(event, roundAmounts);
      const transfer = toRoundedRealizedEvent(
        { ...event, portion: undefined, pricingSource: "transferBasis" },
        roundAmounts,
      );
      const execution = toRoundedRealizedEvent(
        { ...event, portion: "execution" },
        roundAmounts,
      );
      expect([fallback.id, transfer.id, execution.id]).toEqual([
        "event:sale:transfer-fallback",
        "event:sale:transfer",
        "event:sale",
      ]);
      expect(fallback.lotMatches[0]).toMatchObject({
        id: "match:sale:1",
        acquisitionSortKey,
        acquisitionDate: "2026-02-01T00:00:00.000Z",
        acquisitionBookingId: "purchase",
      });
    }
  });

  it("sorts copied open lots and preserves each consumer's running-total rounding", () => {
    const lot = {
      acquisitionSortKey,
      quantity: toMoney("0.123456789123456789"),
      unitCostInReference: toMoney("1.125"),
      periodEndRate: toMoney("1.135"),
      unrealizedGainLoss: toMoney("0.015"),
    };
    const lots = [
      { ...lot, acquisitionSortKey: "2026-02-02T00:00:00.000Z::later" },
      lot,
    ];
    const roundedInput = lots.map((item) => toRoundedOpenLot(item));
    const exactInput = lots.map((item) => toRoundedOpenLot(item, false));
    const originalOrder = lots.map((item) => item.acquisitionSortKey);
    const rounded = addRunningUnrealizedGainLoss(roundedInput);
    const exact = addRunningUnrealizedGainLoss(exactInput, false);

    expect(
      rounded.map((item) => item.runningUnrealizedGainLoss.toString()),
    ).toEqual(["0.02", "0.04"]);
    expect(
      exact.map((item) => item.runningUnrealizedGainLoss.toString()),
    ).toEqual(["0.015", "0.03"]);
    expect(rounded[0]!.unitCostInReference.toString()).toBe("1.12");
    expect(exact[0]!.unitCostInReference.toString()).toBe("1.125");
    expect(rounded[0]!.quantity.toString()).toBe("0.123456789123456789");
    expect(exact[0]!.id).toBe(`lot:${acquisitionSortKey}`);
    for (const input of [roundedInput, exactInput]) {
      expect(input.map((item) => item.acquisitionSortKey)).toEqual(
        originalOrder,
      );
      expect(
        input.map((item) => item.runningUnrealizedGainLoss.toString()),
      ).toEqual(["0", "0"]);
    }
    expect(lots[0]!.acquisitionSortKey).toBe("2026-02-02T00:00:00.000Z::later");
    expect(lot.unrealizedGainLoss.toString()).toBe("0.015");
  });
});

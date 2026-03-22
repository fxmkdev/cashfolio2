import { describe, expect, test } from "vitest";
import { Unit } from "../.prisma-client/enums";
import { isBookingUnitCompatibleWithAccount } from "./account-utils";

describe("isBookingUnitCompatibleWithAccount", () => {
  test("returns false for incomplete booking unit metadata even when target has no unit", () => {
    expect(
      isBookingUnitCompatibleWithAccount(
        {
          unit: Unit.SECURITY,
          currency: null,
          cryptocurrency: null,
          symbol: "AAPL",
          tradeCurrency: null,
        },
        {
          unit: null,
          currency: null,
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
      ),
    ).toBe(false);
  });

  test("returns true for complete booking unit metadata when target has no unit", () => {
    expect(
      isBookingUnitCompatibleWithAccount(
        {
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
        {
          unit: null,
          currency: null,
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
      ),
    ).toBe(true);
  });
});

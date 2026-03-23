import { describe, expect, test } from "vitest";
import { Unit } from "../.prisma-client/enums";
import { getBookingUnitFields } from "./booking-unit-fields";

describe("getBookingUnitFields", () => {
  test("throws when unit is missing", () => {
    expect(() =>
      getBookingUnitFields(
        {
          unit: null,
        },
        "counter account",
      ),
    ).toThrowError("counter account must define a unit.");
  });

  test("returns currency fields for currency unit", () => {
    expect(
      getBookingUnitFields({
        unit: Unit.CURRENCY,
        currency: "EUR",
      }),
    ).toEqual({
      unit: Unit.CURRENCY,
      currency: "EUR",
    });
  });

  test("throws when currency unit has no currency", () => {
    expect(() =>
      getBookingUnitFields(
        {
          unit: Unit.CURRENCY,
        },
        "account",
      ),
    ).toThrowError("account currency is missing.");
  });

  test("returns cryptocurrency fields for cryptocurrency unit", () => {
    expect(
      getBookingUnitFields({
        unit: Unit.CRYPTOCURRENCY,
        cryptocurrency: "BTC",
      }),
    ).toEqual({
      unit: Unit.CRYPTOCURRENCY,
      cryptocurrency: "BTC",
    });
  });

  test("throws when cryptocurrency unit has no cryptocurrency", () => {
    expect(() =>
      getBookingUnitFields(
        {
          unit: Unit.CRYPTOCURRENCY,
        },
        "account",
      ),
    ).toThrowError("account cryptocurrency is missing.");
  });

  test("returns security fields for security unit", () => {
    expect(
      getBookingUnitFields({
        unit: Unit.SECURITY,
        symbol: "AAPL",
        tradeCurrency: "USD",
      }),
    ).toEqual({
      unit: Unit.SECURITY,
      symbol: "AAPL",
      tradeCurrency: "USD",
    });
  });

  test("throws when security unit has no symbol", () => {
    expect(() =>
      getBookingUnitFields(
        {
          unit: Unit.SECURITY,
          tradeCurrency: "USD",
        },
        "account",
      ),
    ).toThrowError("account symbol is missing.");
  });

  test("throws when security unit has no trade currency", () => {
    expect(() =>
      getBookingUnitFields(
        {
          unit: Unit.SECURITY,
          symbol: "AAPL",
        },
        "account",
      ),
    ).toThrowError("account trade currency is missing.");
  });
});

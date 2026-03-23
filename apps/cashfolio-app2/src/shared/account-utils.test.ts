import { describe, expect, test } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import {
  isBookingUnitCompatibleWithAccount,
  isBookingValueCompatibleWithAccountType,
} from "./account-utils";

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

describe("isBookingValueCompatibleWithAccountType", () => {
  test("returns false for positive value on income account", () => {
    expect(
      isBookingValueCompatibleWithAccountType(100, {
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.INCOME,
      }),
    ).toBe(false);
  });

  test("returns false for negative value on expense account", () => {
    expect(
      isBookingValueCompatibleWithAccountType(-100, {
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.EXPENSE,
      }),
    ).toBe(false);
  });

  test("returns true for non-equity accounts", () => {
    expect(
      isBookingValueCompatibleWithAccountType(-100, {
        type: AccountType.ASSET,
        equityAccountSubtype: null,
      }),
    ).toBe(true);
  });
});

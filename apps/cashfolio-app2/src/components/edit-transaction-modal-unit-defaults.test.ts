import { describe, expect, test } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import type {
  AccountOption,
  BookingValues,
} from "./edit-transaction-modal-types";
import { createBookingUnitDefaults } from "./edit-transaction-modal-unit-defaults";

function accountOption(
  overrides: Partial<AccountOption> & Pick<AccountOption, "value" | "label">,
): AccountOption {
  return {
    value: overrides.value,
    label: overrides.label,
    unit: "unit" in overrides ? (overrides.unit ?? null) : Unit.CURRENCY,
    type: overrides.type ?? AccountType.ASSET,
    currency: overrides.currency,
    cryptocurrency: overrides.cryptocurrency,
    symbol: overrides.symbol,
    tradeCurrency: overrides.tradeCurrency,
    equityAccountSubtype: overrides.equityAccountSubtype ?? null,
  };
}

describe("createBookingUnitDefaults", () => {
  test("copies locked booking unit fields for unitless equity targets", () => {
    const selectedAccount = accountOption({
      value: "equity",
      label: "Accounts / Equity",
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
      unit: null,
    });
    const lockedBooking: BookingValues = {
      key: "locked",
      unit: Unit.SECURITY,
      symbol: "AAPL",
      tradeCurrency: "USD",
    };

    expect(
      createBookingUnitDefaults({ selectedAccount, lockedBooking }),
    ).toEqual({
      unit: Unit.SECURITY,
      currency: undefined,
      cryptocurrency: undefined,
      symbol: "AAPL",
      tradeCurrency: "USD",
    });
  });

  test("uses selected account unit fields when target account has its own unit", () => {
    const selectedAccount = accountOption({
      value: "crypto",
      label: "Asset / Assets / BTC",
      type: AccountType.ASSET,
      unit: Unit.CRYPTOCURRENCY,
      cryptocurrency: "BTC",
    });
    const lockedBooking: BookingValues = {
      key: "locked",
      unit: Unit.CURRENCY,
      currency: "CHF",
    };

    expect(
      createBookingUnitDefaults({ selectedAccount, lockedBooking }),
    ).toEqual({
      unit: Unit.CRYPTOCURRENCY,
      currency: undefined,
      cryptocurrency: "BTC",
      symbol: undefined,
      tradeCurrency: undefined,
    });
  });
});

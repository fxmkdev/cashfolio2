import { describe, expect, test } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import type { AccountOption } from "@/shared/account-options";
import type { BookingValues } from "./edit-transaction-modal-types";
import { createBookingUnitDefaults } from "./edit-transaction-modal-unit-defaults";

function accountOption(
  overrides: Partial<AccountOption> & Pick<AccountOption, "value" | "label">,
): AccountOption {
  return {
    value: overrides.value,
    label: overrides.label,
    unit: "unit" in overrides ? (overrides.unit ?? null) : Unit.CURRENCY,
    type: overrides.type ?? AccountType.BALANCE,
    currency: overrides.currency,
    cryptocurrency: overrides.cryptocurrency,
    symbol: overrides.symbol,
    tradeCurrency: overrides.tradeCurrency,
    equityAccountSubtype: overrides.equityAccountSubtype ?? null,
  };
}

describe("createBookingUnitDefaults", () => {
  describe.each([EquityAccountSubtype.INCOME, EquityAccountSubtype.EXPENSE])(
    "%s category",
    (equityAccountSubtype) => {
      const selectedCategory = accountOption({
        value: "category",
        label: "Category",
        type: AccountType.EQUITY,
        equityAccountSubtype,
        unit: null,
      });
      const unitFields: Pick<
        BookingValues,
        "unit" | "currency" | "cryptocurrency" | "symbol" | "tradeCurrency"
      >[] = [
        { unit: Unit.CURRENCY, currency: "EUR" },
        { unit: Unit.CRYPTOCURRENCY, cryptocurrency: "BTC" },
        { unit: Unit.SECURITY, symbol: "AAPL", tradeCurrency: "USD" },
      ];

      test.each(unitFields)(
        "defaults a new booking to the locked booking's $unit metadata",
        (fields) => {
          expect(
            createBookingUnitDefaults({
              selectedAccount: selectedCategory,
              lockedBooking: { key: "locked", ...fields },
              currentBooking: { key: "new" },
            }),
          ).toEqual({
            currency: undefined,
            cryptocurrency: undefined,
            symbol: undefined,
            tradeCurrency: undefined,
            ...fields,
          });
        },
      );

      test.each(unitFields)(
        "preserves existing booking $unit metadata instead of the locked CHF unit",
        (fields) => {
          expect(
            createBookingUnitDefaults({
              selectedAccount: selectedCategory,
              lockedBooking: {
                key: "locked",
                unit: Unit.CURRENCY,
                currency: "CHF",
              },
              currentBooking: { key: "existing", ...fields },
            }),
          ).toEqual({
            currency: undefined,
            cryptocurrency: undefined,
            symbol: undefined,
            tradeCurrency: undefined,
            ...fields,
          });
        },
      );

      test("copies unit fields together without retaining metadata from a unitless booking", () => {
        expect(
          createBookingUnitDefaults({
            selectedAccount: selectedCategory,
            lockedBooking: {
              key: "locked",
              unit: Unit.CURRENCY,
              currency: "CHF",
            },
            currentBooking: {
              key: "new",
              currency: "EUR",
              cryptocurrency: "BTC",
              symbol: "AAPL",
              tradeCurrency: "USD",
            },
          }),
        ).toEqual({
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: undefined,
          symbol: undefined,
          tradeCurrency: undefined,
        });
      });

      test("preserves an existing unit with incomplete metadata for validation", () => {
        expect(
          createBookingUnitDefaults({
            selectedAccount: selectedCategory,
            lockedBooking: {
              key: "locked",
              unit: Unit.CURRENCY,
              currency: "CHF",
            },
            currentBooking: { key: "incomplete", unit: Unit.CURRENCY },
          }),
        ).toEqual({
          unit: Unit.CURRENCY,
          currency: undefined,
          cryptocurrency: undefined,
          symbol: undefined,
          tradeCurrency: undefined,
        });
      });
    },
  );

  test("copies locked booking unit fields for unitless equity targets", () => {
    const selectedAccount = accountOption({
      value: "equity",
      label: "Equity",
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
      label: "BTC",
      type: AccountType.BALANCE,
      unit: Unit.CRYPTOCURRENCY,
      cryptocurrency: "BTC",
    });
    const lockedBooking: BookingValues = {
      key: "locked",
      unit: Unit.CURRENCY,
      currency: "CHF",
    };

    expect(
      createBookingUnitDefaults({
        selectedAccount,
        lockedBooking,
        currentBooking: {
          key: "imported",
          unit: Unit.CURRENCY,
          currency: "EUR",
        },
      }),
    ).toEqual({
      unit: Unit.CRYPTOCURRENCY,
      currency: undefined,
      cryptocurrency: "BTC",
      symbol: undefined,
      tradeCurrency: undefined,
    });
  });
});

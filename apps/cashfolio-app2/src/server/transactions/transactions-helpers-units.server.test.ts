import { describe, expect, test } from "vitest";
import { AccountType, Unit } from "../../.prisma-client/enums";
import type {
  BookingUnitFields,
  BookingUnitFieldsSource,
} from "../../shared/transactions/booking-unit-fields";
import { validateAccountTypeBookingsWithAccounts } from "./transactions-helpers.server.test-support";
describe("booking and balance account unit compatibility", () => {
  function validate(
    account: BookingUnitFieldsSource,
    booking: BookingUnitFields,
    type: AccountType = AccountType.BALANCE,
  ) {
    validateAccountTypeBookingsWithAccounts(
      [{ ...booking, accountId: "account", value: 10, date: "2026-01-12" }],
      new Map([
        [
          "account",
          { ...account, id: "account", type, equityAccountSubtype: null },
        ],
      ]),
      { accountBookStartDate: new Date("2026-01-01T00:00:00Z") },
    );
  }

  test.each([
    {
      name: "different currencies",
      account: { unit: Unit.CURRENCY, currency: "EUR" },
      booking: { unit: Unit.CURRENCY, currency: "USD" },
    },
    {
      name: "different cryptocurrencies",
      account: { unit: Unit.CRYPTOCURRENCY, cryptocurrency: "BTC" },
      booking: { unit: Unit.CRYPTOCURRENCY, cryptocurrency: "ETH" },
    },
    {
      name: "different security symbols",
      account: { unit: Unit.SECURITY, symbol: "AAPL", tradeCurrency: "USD" },
      booking: { unit: Unit.SECURITY, symbol: "MSFT", tradeCurrency: "USD" },
    },
    {
      name: "different unit types",
      account: { unit: Unit.CURRENCY, currency: "USD" },
      booking: { unit: Unit.CRYPTOCURRENCY, cryptocurrency: "BTC" },
    },
  ])("rejects $name", ({ account, booking }) => {
    expect(() => validate(account, booking)).toThrow(
      "Booking 0: Account must use the same unit as the booking.",
    );
  });

  test.each<BookingUnitFieldsSource>([
    { unit: null },
    { unit: Unit.CURRENCY, currency: null },
    { unit: Unit.CRYPTOCURRENCY, cryptocurrency: null },
    { unit: Unit.SECURITY, symbol: null, tradeCurrency: "USD" },
    { unit: Unit.SECURITY, symbol: "AAPL", tradeCurrency: null },
  ])("rejects incomplete balance account metadata %j", (account) => {
    expect(() =>
      validate(account, {
        unit: Unit.SECURITY,
        symbol: "AAPL",
        tradeCurrency: "USD",
      }),
    ).toThrow("Booking 0: Account must use the same unit as the booking.");
  });

  test.each<BookingUnitFields>([
    { unit: Unit.CURRENCY, currency: "CHF" },
    { unit: Unit.CRYPTOCURRENCY, cryptocurrency: "BTC" },
    { unit: Unit.SECURITY, symbol: "AAPL", tradeCurrency: "USD" },
  ])("accepts matching units %j", (unit) => {
    expect(() => validate(unit, unit)).not.toThrow();
  });

  test("accepts the same security symbol with a different trade currency", () => {
    expect(() =>
      validate(
        { unit: Unit.SECURITY, symbol: "AAPL", tradeCurrency: "EUR" },
        { unit: Unit.SECURITY, symbol: "AAPL", tradeCurrency: "USD" },
      ),
    ).not.toThrow();
  });

  test.each<BookingUnitFields>([
    { unit: Unit.CURRENCY, currency: "CHF" },
    { unit: Unit.CRYPTOCURRENCY, cryptocurrency: "BTC" },
    { unit: Unit.SECURITY, symbol: "AAPL", tradeCurrency: "USD" },
  ])("accepts unrestricted units for equity categories %j", (booking) => {
    expect(() =>
      validate({ unit: null }, booking, AccountType.EQUITY),
    ).not.toThrow();
  });
});

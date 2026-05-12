import { describe, expect, test } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import {
  validateRebookBookingTarget,
  type RebookBookingValidationInput,
  type RebookTargetAccountValidationInput,
} from "./rebook-booking-validation";
import { OPENING_BALANCES_MANAGEMENT_MESSAGE } from "../../shared/opening-balances";

function createBooking(
  overrides: Partial<RebookBookingValidationInput> = {},
): RebookBookingValidationInput {
  return {
    accountId: "source-account",
    date: new Date("2026-01-01T00:00:00.000Z"),
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    value: -100,
    ...overrides,
  };
}

function createTargetAccount(
  overrides: Partial<RebookTargetAccountValidationInput> = {},
): RebookTargetAccountValidationInput {
  return {
    id: "target-account",
    isActive: true,
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    type: AccountType.ASSET,
    equityAccountSubtype: null,
    ...overrides,
  };
}

describe("validateRebookBookingTarget", () => {
  test("rejects inactive target accounts", () => {
    expect(() =>
      validateRebookBookingTarget({
        booking: createBooking(),
        targetAccount: createTargetAccount({ isActive: false }),
        accountBookStartDate: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).toThrowError("Target account must be active.");
  });

  test("rejects incompatible units", () => {
    expect(() =>
      validateRebookBookingTarget({
        booking: createBooking({ currency: "CHF" }),
        targetAccount: createTargetAccount({ currency: "USD" }),
        accountBookStartDate: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).toThrowError("Target account must use the same unit as the booking.");
  });

  test("rejects incomplete source booking unit details even for unit-less target account", () => {
    expect(() =>
      validateRebookBookingTarget({
        booking: createBooking({
          unit: Unit.SECURITY,
          currency: null,
          symbol: "AAPL",
          tradeCurrency: null,
        }),
        targetAccount: createTargetAccount({
          unit: null,
          currency: null,
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        }),
        accountBookStartDate: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).toThrowError("Source booking unit details are incomplete.");
  });

  test("rejects sign-invalid rebook to expense account", () => {
    expect(() =>
      validateRebookBookingTarget({
        booking: createBooking({ value: -10 }),
        targetAccount: createTargetAccount({
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.EXPENSE,
          unit: Unit.CURRENCY,
          currency: "CHF",
        }),
        accountBookStartDate: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).toThrowError("Expense accounts cannot have credit entries.");
  });

  test("accepts symbol-compatible security rebook with different trade currency", () => {
    expect(() =>
      validateRebookBookingTarget({
        booking: createBooking({
          unit: Unit.SECURITY,
          currency: null,
          symbol: "AAPL",
          tradeCurrency: "USD",
        }),
        targetAccount: createTargetAccount({
          unit: Unit.SECURITY,
          currency: null,
          symbol: "AAPL",
          tradeCurrency: "EUR",
        }),
        accountBookStartDate: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).not.toThrow();
  });

  test("rejects rebook to opening-balances account", () => {
    expect(() =>
      validateRebookBookingTarget({
        booking: createBooking({ date: new Date("2026-01-04T00:00:00.000Z") }),
        targetAccount: createTargetAccount({
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
          unit: Unit.CURRENCY,
          currency: "CHF",
        }),
        accountBookStartDate: new Date("2026-01-04T12:34:00.000Z"),
      }),
    ).toThrowError(OPENING_BALANCES_MANAGEMENT_MESSAGE);
  });

  test("rejects rebook when source transaction contains opening balances", () => {
    expect(() =>
      validateRebookBookingTarget({
        booking: createBooking({ date: new Date("2026-01-04T14:00:00.000Z") }),
        targetAccount: createTargetAccount({ currency: "CHF" }),
        accountBookStartDate: new Date("2026-01-04T12:34:00.000Z"),
        sourceTransactionContainsOpeningBalancesBooking: true,
      }),
    ).toThrowError(OPENING_BALANCES_MANAGEMENT_MESSAGE);
  });

  test("rejects rebook for bookings before account-book start date", () => {
    expect(() =>
      validateRebookBookingTarget({
        booking: createBooking({ date: new Date("2026-01-02T14:00:00.000Z") }),
        targetAccount: createTargetAccount({ currency: "CHF" }),
        accountBookStartDate: new Date("2026-01-04T12:34:00.000Z"),
      }),
    ).toThrowError(
      "Date cannot be before account book start date (2026-01-04).",
    );
  });
});

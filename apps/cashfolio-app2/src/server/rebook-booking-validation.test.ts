import { describe, expect, test } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import {
  validateRebookBookingTarget,
  type RebookBookingValidationInput,
  type RebookTargetAccountValidationInput,
} from "./rebook-booking-validation";

function createBooking(
  overrides: Partial<RebookBookingValidationInput> = {},
): RebookBookingValidationInput {
  return {
    accountId: "source-account",
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
      }),
    ).toThrowError("Target account must be active.");
  });

  test("rejects incompatible units", () => {
    expect(() =>
      validateRebookBookingTarget({
        booking: createBooking({ currency: "CHF" }),
        targetAccount: createTargetAccount({ currency: "USD" }),
      }),
    ).toThrowError("Target account must use the same unit as the booking.");
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
      }),
    ).not.toThrow();
  });
});

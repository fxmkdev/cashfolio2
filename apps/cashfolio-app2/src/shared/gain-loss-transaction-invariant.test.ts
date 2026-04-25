import { describe, expect, test } from "vitest";
import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
import {
  GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE,
  isGainLossAccount,
  validateGainLossSimpleTransactionInvariant,
} from "./gain-loss-transaction-invariant";

describe("isGainLossAccount", () => {
  test("returns true only for equity gain/loss accounts", () => {
    expect(
      isGainLossAccount({
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
      }),
    ).toBe(true);
    expect(
      isGainLossAccount({
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.INCOME,
      }),
    ).toBe(false);
    expect(
      isGainLossAccount({
        type: AccountType.ASSET,
        equityAccountSubtype: null,
      }),
    ).toBe(false);
  });
});

describe("validateGainLossSimpleTransactionInvariant", () => {
  test("accepts gain/loss paired with asset", () => {
    expect(
      validateGainLossSimpleTransactionInvariant([
        {
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        },
        {
          type: AccountType.ASSET,
          equityAccountSubtype: null,
        },
      ]),
    ).toBeNull();
  });

  test("accepts gain/loss paired with liability", () => {
    expect(
      validateGainLossSimpleTransactionInvariant([
        {
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        },
        {
          type: AccountType.LIABILITY,
          equityAccountSubtype: null,
        },
      ]),
    ).toBeNull();
  });

  test("rejects gain/loss transactions with more than two bookings", () => {
    expect(
      validateGainLossSimpleTransactionInvariant([
        {
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        },
        {
          type: AccountType.ASSET,
          equityAccountSubtype: null,
        },
        {
          type: AccountType.ASSET,
          equityAccountSubtype: null,
        },
      ]),
    ).toBe(GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE);
  });

  test("rejects gain/loss paired with non-asset-liability account", () => {
    expect(
      validateGainLossSimpleTransactionInvariant([
        {
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        },
        {
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.INCOME,
        },
      ]),
    ).toBe(GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE);
  });

  test("rejects two gain/loss bookings", () => {
    expect(
      validateGainLossSimpleTransactionInvariant([
        {
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        },
        {
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        },
      ]),
    ).toBe(GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE);
  });
});

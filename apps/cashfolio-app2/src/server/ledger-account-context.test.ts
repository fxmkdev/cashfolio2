import { describe, expect, it } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import {
  doesLedgerAccountContextMatchAccount,
  parseLedgerAccountContextFromInput,
} from "./ledger-account-context";

const validInput = {
  accountType: AccountType.ASSET,
  accountEquityAccountSubtype: null,
  accountUnit: Unit.CURRENCY,
  accountCurrency: "CHF",
  accountCryptocurrency: null,
  accountSymbol: null,
  accountTradeCurrency: null,
};

describe("parseLedgerAccountContextFromInput", () => {
  it("parses a complete ledger account context", () => {
    expect(parseLedgerAccountContextFromInput(validInput)).toEqual({
      type: AccountType.ASSET,
      equityAccountSubtype: null,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
    });
  });

  it("parses nullable optional account fields", () => {
    expect(
      parseLedgerAccountContextFromInput({
        accountType: AccountType.EQUITY,
        accountEquityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        accountUnit: null,
        accountCurrency: null,
        accountCryptocurrency: null,
        accountSymbol: null,
        accountTradeCurrency: null,
      }),
    ).toEqual({
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
      unit: null,
      currency: null,
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
    });
  });

  it("rejects missing required context fields", () => {
    for (const field of [
      "accountType",
      "accountEquityAccountSubtype",
      "accountUnit",
      "accountCurrency",
      "accountCryptocurrency",
      "accountSymbol",
      "accountTradeCurrency",
    ]) {
      const input: Record<string, unknown> = { ...validInput };
      delete input[field];

      expect(parseLedgerAccountContextFromInput(input)).toBeNull();
    }
  });

  it("rejects invalid enum and string values", () => {
    expect(
      parseLedgerAccountContextFromInput({
        ...validInput,
        accountType: "INVALID",
      }),
    ).toBeNull();
    expect(
      parseLedgerAccountContextFromInput({
        ...validInput,
        accountType: 1,
      }),
    ).toBeNull();
    expect(
      parseLedgerAccountContextFromInput({
        ...validInput,
        accountEquityAccountSubtype: "INVALID",
      }),
    ).toBeNull();
    expect(
      parseLedgerAccountContextFromInput({
        ...validInput,
        accountUnit: "INVALID",
      }),
    ).toBeNull();
    expect(
      parseLedgerAccountContextFromInput({
        ...validInput,
        accountCurrency: 42,
      }),
    ).toBeNull();
  });
});

describe("doesLedgerAccountContextMatchAccount", () => {
  const accountContext = {
    type: AccountType.ASSET,
    equityAccountSubtype: null,
    unit: Unit.SECURITY,
    currency: null,
    cryptocurrency: null,
    symbol: "AAPL",
    tradeCurrency: "USD",
  };

  it("matches identical account contexts", () => {
    expect(
      doesLedgerAccountContextMatchAccount({
        accountContext,
        account: { ...accountContext },
      }),
    ).toBe(true);
  });

  it("rejects mismatched account contexts", () => {
    for (const account of [
      { ...accountContext, type: AccountType.LIABILITY },
      {
        ...accountContext,
        equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
      },
      { ...accountContext, unit: Unit.CURRENCY },
      { ...accountContext, currency: "CHF" },
      { ...accountContext, cryptocurrency: "BTC" },
      { ...accountContext, symbol: "MSFT" },
      { ...accountContext, tradeCurrency: "CHF" },
    ]) {
      expect(
        doesLedgerAccountContextMatchAccount({
          accountContext,
          account,
        }),
      ).toBe(false);
    }
  });
});

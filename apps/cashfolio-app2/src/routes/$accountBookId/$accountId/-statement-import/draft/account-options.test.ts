import { describe, expect, test } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "@/.prisma-client/enums";
import {
  getStatementImportDisabledReason,
  shouldIncludeStatementImportAccountOption,
} from "../index";

const statementImportCsvFormat = {
  hasHeader: true,
  delimitersToGuess: [","],
  columns: ["date", "amount", "description"],
} as const;

describe("statement import account options", () => {
  test("includes the archived current account in import account options", () => {
    const archivedCurrentAccount = {
      id: "asset-1",
      isActive: false,
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
    };
    const archivedOtherAccount = {
      ...archivedCurrentAccount,
      id: "asset-2",
    };
    const openingBalancesAccount = {
      ...archivedCurrentAccount,
      id: "opening-balances",
      isActive: true,
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
    };

    expect(
      shouldIncludeStatementImportAccountOption(
        archivedCurrentAccount,
        "asset-1",
      ),
    ).toBe(true);
    expect(
      shouldIncludeStatementImportAccountOption(
        archivedOtherAccount,
        "asset-1",
      ),
    ).toBe(false);
    expect(
      shouldIncludeStatementImportAccountOption(
        openingBalancesAccount,
        "asset-1",
      ),
    ).toBe(false);
  });

  test("requires an account statement import format", () => {
    expect(
      getStatementImportDisabledReason({
        type: AccountType.BALANCE,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        statementImportCsvFormat: null,
      }),
    ).toBe(
      "Statement imports require a CSV format configured on this account.",
    );
    expect(
      getStatementImportDisabledReason({
        type: AccountType.BALANCE,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        statementImportCsvFormat,
      }),
    ).toBeNull();
  });
});

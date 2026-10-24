import { describe, expect, test } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import {
  applyAccountGroupCashInheritance,
  getAccountCashParentCompatibilityError,
  getCashAccountDisabledReason,
  isAccountGroupCompatibleWithAccountCashRules,
  resolveAccountCashAccountFormValue,
} from "./account-cash-form-rules";
import {
  createAccountInitialValues,
  transformAccountValues,
  validateStatementImportCsvFormatFormValue,
} from "./edit-account-modal";

describe("transformAccountValues", () => {
  test("strips hidden unit identity fields for equity accounts", () => {
    expect(
      transformAccountValues({
        name: "Groceries",
        typeDescriptor: `${AccountType.EQUITY}-${EquityAccountSubtype.EXPENSE}`,
        groupId: "group-expenses",
        sortOrder: 1,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: "BTC",
        symbol: "AAPL",
        tradeCurrency: "USD",
        statementImportCsvFormat: JSON.stringify({
          hasHeader: true,
          delimitersToGuess: [","],
          columns: ["date", "amount", "description"],
        }),
        isCashAccount: true,
      }),
    ).toEqual({
      name: "Groceries",
      typeDescriptor: `${AccountType.EQUITY}-${EquityAccountSubtype.EXPENSE}`,
      groupId: "group-expenses",
      sortOrder: 1,
      unit: undefined,
      currency: undefined,
      cryptocurrency: undefined,
      symbol: undefined,
      tradeCurrency: undefined,
      statementImportCsvFormat: null,
      isCashAccount: false,
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
      openingBalance: null,
    });
  });

  test("keeps selected unit identity fields for non-equity accounts", () => {
    const statementImportCsvFormat = {
      hasHeader: true,
      delimitersToGuess: [";"],
      columns: ["date", "amount", "description"],
    };

    expect(
      transformAccountValues({
        name: "Brokerage",
        typeDescriptor: AccountType.ASSET,
        groupId: "group-assets",
        sortOrder: 2,
        openingBalance: "125.5",
        unit: Unit.SECURITY,
        symbol: "AAPL",
        tradeCurrency: "USD",
        statementImportCsvFormat: JSON.stringify(statementImportCsvFormat),
        isCashAccount: true,
      }),
    ).toEqual({
      name: "Brokerage",
      typeDescriptor: AccountType.ASSET,
      groupId: "group-assets",
      sortOrder: 2,
      openingBalance: 125.5,
      unit: Unit.SECURITY,
      symbol: "AAPL",
      tradeCurrency: "USD",
      statementImportCsvFormat,
      isCashAccount: false,
      type: AccountType.ASSET,
    });
  });

  test("transforms blank statement import format to null", () => {
    expect(
      transformAccountValues({
        name: "Cash",
        typeDescriptor: AccountType.ASSET,
        unit: Unit.CURRENCY,
        currency: "CHF",
        statementImportCsvFormat: "   ",
      }),
    ).toMatchObject({
      statementImportCsvFormat: null,
    });
  });

  test("validates statement import format JSON", () => {
    expect(
      validateStatementImportCsvFormatFormValue("{not-json", AccountType.ASSET),
    ).toBe("Statement import CSV format must be valid JSON.");
    expect(
      validateStatementImportCsvFormatFormValue(
        JSON.stringify({
          hasHeader: true,
          delimitersToGuess: [","],
          columns: ["date", "amount", "description"],
        }),
        AccountType.ASSET,
      ),
    ).toBeNull();
  });

  test("keeps cash flag for currency accounts", () => {
    expect(
      transformAccountValues({
        name: "Checking",
        typeDescriptor: AccountType.ASSET,
        unit: Unit.CURRENCY,
        currency: "CHF",
        isCashAccount: true,
      }),
    ).toMatchObject({
      type: AccountType.ASSET,
      unit: Unit.CURRENCY,
      currency: "CHF",
      isCashAccount: true,
    });
  });
});

describe("createAccountInitialValues", () => {
  test("preserves cash account and import settings for account edit sources", () => {
    const statementImportCsvFormat = {
      hasHeader: true,
      delimitersToGuess: [","],
      columns: ["date", "amount", "description"],
    } as const;

    expect(
      createAccountInitialValues({
        name: "Checking",
        type: AccountType.ASSET,
        equityAccountSubtype: null,
        groupId: null,
        sortOrder: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        statementImportCsvFormat,
        isCashAccount: true,
        openingBalance: 100,
      }),
    ).toEqual({
      name: "Checking",
      type: AccountType.ASSET,
      equityAccountSubtype: null,
      groupId: undefined,
      sortOrder: undefined,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      statementImportCsvFormat,
      isCashAccount: true,
      openingBalance: 100,
    });
  });
});

describe("account cash group helpers", () => {
  const accountGroups = [
    {
      value: "cash-group",
      label: "Cash",
      type: AccountType.ASSET,
      equityAccountSubtype: null,
      isCashAccount: true,
    },
    {
      value: "asset-group",
      label: "Assets",
      type: AccountType.ASSET,
      equityAccountSubtype: null,
      isCashAccount: false,
    },
  ];

  test("inherits cash status from selected account group", () => {
    expect(
      resolveAccountCashAccountFormValue({
        type: AccountType.ASSET,
        unit: Unit.CURRENCY,
        groupId: "cash-group",
        isCashAccount: false,
        accountGroups,
      }),
    ).toBe(true);
    expect(
      resolveAccountCashAccountFormValue({
        type: AccountType.ASSET,
        unit: Unit.CURRENCY,
        groupId: "asset-group",
        isCashAccount: true,
        accountGroups,
      }),
    ).toBe(false);
  });

  test("keeps root cash account selections independent", () => {
    expect(
      resolveAccountCashAccountFormValue({
        type: AccountType.ASSET,
        unit: Unit.CURRENCY,
        isCashAccount: true,
        accountGroups,
      }),
    ).toBe(true);
  });

  test("explains disabled cash account state", () => {
    expect(
      getCashAccountDisabledReason({
        type: AccountType.ASSET,
        unit: Unit.CURRENCY,
        groupId: "cash-group",
      }),
    ).toBe("Cash account status is inherited from the selected group.");
    expect(
      getCashAccountDisabledReason({
        type: AccountType.ASSET,
        unit: Unit.SECURITY,
      }),
    ).toBe("Only root-level currency accounts can be marked as cash accounts.");
  });

  test("blocks cash group options for non-currency assets", () => {
    expect(
      isAccountGroupCompatibleWithAccountCashRules({
        accountType: AccountType.ASSET,
        accountUnit: Unit.SECURITY,
        group: { isCashAccount: true },
      }),
    ).toBe(false);
    expect(
      isAccountGroupCompatibleWithAccountCashRules({
        accountType: AccountType.ASSET,
        accountUnit: Unit.SECURITY,
        group: { isCashAccount: false },
      }),
    ).toBe(true);
  });

  test.each([
    ["security asset", AccountType.ASSET, Unit.SECURITY],
    ["crypto asset", AccountType.ASSET, Unit.CRYPTOCURRENCY],
    ["equity", AccountType.EQUITY, Unit.CURRENCY],
  ])(
    "returns a group error when moving a %s account into a cash group",
    (_label, accountType, accountUnit) => {
      expect(
        getAccountCashParentCompatibilityError({
          accountType,
          accountUnit,
          groupId: "cash-group",
          accountGroups,
        }),
      ).toBe("Cash account groups can contain only currency accounts.");
    },
  );

  test.each([AccountType.ASSET, AccountType.LIABILITY])(
    "allows currency %s accounts in cash groups",
    (accountType) => {
      expect(
        getAccountCashParentCompatibilityError({
          accountType,
          accountUnit: Unit.CURRENCY,
          groupId: "cash-group",
          accountGroups,
        }),
      ).toBeNull();
    },
  );

  test("applies inherited cash status before submit", () => {
    expect(
      applyAccountGroupCashInheritance(
        {
          name: "Brokerage",
          typeDescriptor: AccountType.ASSET,
          type: AccountType.ASSET,
          unit: Unit.SECURITY,
          groupId: "asset-group",
          isCashAccount: true,
          openingBalance: null,
        },
        accountGroups,
      ),
    ).toMatchObject({ isCashAccount: false });
  });
});

import { describe, expect, test } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import {
  validateAccountGroupInput,
  validateAccountGroupParentGroupId,
  validateAccountCashAccountFlag,
  validateAccountGroupCashAccountFlag,
  validateAccountInput,
  validateEquitySubtypeTypeCombination,
  validateGroupEquitySubtypeTypeCombination,
  validateAccountTradeCurrency,
  validateAccountUnit,
  validateAccountStatementImportCsvFormat,
} from "./account-validation";
import type { AccountInput } from "./account-validation-types";

describe("validateAccountUnit", () => {
  test("requires unit for asset and liability accounts", () => {
    expect(validateAccountUnit(undefined, AccountType.ASSET)).toBe(
      "Unit is required",
    );
    expect(validateAccountUnit(undefined, AccountType.LIABILITY)).toBe(
      "Unit is required",
    );
  });

  test("does not require unit for equity accounts", () => {
    expect(validateAccountUnit(undefined, AccountType.EQUITY)).toBeNull();
  });
});

describe("validateAccountTradeCurrency", () => {
  test("requires trade currency for security assets/liabilities", () => {
    expect(
      validateAccountTradeCurrency(undefined, Unit.SECURITY, AccountType.ASSET),
    ).toBe("Trade currency is required");
  });

  test("allows non-security units without trade currency", () => {
    expect(
      validateAccountTradeCurrency(undefined, Unit.CURRENCY, AccountType.ASSET),
    ).toBeNull();
  });
});

describe("validateAccountCashAccountFlag", () => {
  test("allows currency accounts to be marked as cash", () => {
    expect(
      validateAccountCashAccountFlag(true, Unit.CURRENCY, AccountType.ASSET),
    ).toBeNull();
  });

  test("rejects non-currency asset cash accounts", () => {
    expect(
      validateAccountCashAccountFlag(true, Unit.SECURITY, AccountType.ASSET),
    ).toBe("Cash accounts must be currency accounts");
    expect(
      validateAccountCashAccountFlag(true, Unit.CURRENCY, AccountType.EQUITY),
    ).toBe("Cash accounts must be currency accounts");
  });
});

describe("validateAccountGroupCashAccountFlag", () => {
  test("allows asset groups to be marked as cash", () => {
    expect(
      validateAccountGroupCashAccountFlag(true, AccountType.ASSET),
    ).toBeNull();
  });

  test("rejects category cash account groups", () => {
    expect(validateAccountGroupCashAccountFlag(true, AccountType.EQUITY)).toBe(
      "Cash account groups must be account groups",
    );
  });
});

describe("validateAccountInput", () => {
  test("throws first validation error", () => {
    const invalid: AccountInput = {
      accountBookId: "book-1",
      name: "",
      type: AccountType.ASSET,
      unit: undefined,
    };

    expect(() => validateAccountInput(invalid)).toThrowError(
      "Name is required",
    );
  });

  test("passes for valid security asset input", () => {
    const valid: AccountInput = {
      accountBookId: "book-1",
      name: "Broker",
      type: AccountType.ASSET,
      unit: Unit.SECURITY,
      symbol: "AAPL",
      tradeCurrency: "USD",
    };

    expect(() => validateAccountInput(valid)).not.toThrow();
  });

  test("rejects non-equity account types that include an equity subtype", () => {
    const invalid: AccountInput = {
      accountBookId: "book-1",
      name: "Invalid",
      type: AccountType.ASSET,
      equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
      unit: Unit.CURRENCY,
      currency: "CHF",
    };

    expect(() => validateAccountInput(invalid)).toThrowError(
      "Equity subtype is only allowed for equity accounts",
    );
  });

  test("rejects invalid statement import CSV formats", () => {
    expect(
      validateAccountStatementImportCsvFormat(
        {
          hasHeader: false,
          delimitersToGuess: [","],
          mappings: {
            date: { header: "Date" },
            amount: { mode: "signed", column: 1 },
          },
        },
        AccountType.ASSET,
      ),
    ).toBe(
      'CSV format cannot use header column "Date" when hasHeader is false.',
    );
  });

  test("rejects statement import CSV formats for equity accounts", () => {
    expect(
      validateAccountStatementImportCsvFormat(
        {
          hasHeader: true,
          delimitersToGuess: [","],
          columns: ["date", "amount", "description"],
        },
        AccountType.EQUITY,
      ),
    ).toBe(
      "Statement import CSV format is only allowed for asset and liability accounts",
    );
  });

  test("rejects cash flag on non-currency asset input", () => {
    const invalid: AccountInput = {
      accountBookId: "book-1",
      name: "Broker",
      type: AccountType.ASSET,
      unit: Unit.SECURITY,
      symbol: "AAPL",
      tradeCurrency: "USD",
      isCashAccount: true,
    };

    expect(() => validateAccountInput(invalid)).toThrowError(
      "Cash accounts must be currency accounts",
    );
  });
});

describe("validateAccountGroupParentGroupId", () => {
  test("rejects self-parenting", () => {
    expect(
      validateAccountGroupParentGroupId("group-1", {
        editingId: "group-1",
      }),
    ).toBe("A group cannot be its own parent");
  });

  test("rejects moving under descendant group", () => {
    expect(
      validateAccountGroupParentGroupId("child-1", {
        editingId: "group-1",
        descendantGroupIds: new Set(["child-1", "child-2"]),
      }),
    ).toBe("A group cannot be moved under one of its sub-groups");
  });
});

describe("validateAccountGroupInput", () => {
  test("rejects duplicate sibling group name", () => {
    expect(() =>
      validateAccountGroupInput(
        {
          accountBookId: "book-1",
          name: "Assets",
          type: AccountType.ASSET,
        },
        ["assets"],
      ),
    ).toThrowError("A group with this name already exists");
  });

  test("rejects non-equity groups that include an equity subtype", () => {
    expect(() =>
      validateAccountGroupInput({
        accountBookId: "book-1",
        name: "Invalid group",
        type: AccountType.ASSET,
        equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
      }),
    ).toThrowError("Equity subtype is only allowed for equity groups");
  });

  test("rejects cash flag on category group input", () => {
    expect(() =>
      validateAccountGroupInput({
        accountBookId: "book-1",
        name: "Invalid cash group",
        type: AccountType.EQUITY,
        isCashAccount: true,
      }),
    ).toThrowError("Cash account groups must be account groups");
  });
});

describe("equity subtype type-combination validators", () => {
  test("allows subtype for equity accounts and groups", () => {
    expect(
      validateEquitySubtypeTypeCombination(
        AccountType.EQUITY,
        EquityAccountSubtype.INCOME,
      ),
    ).toBeNull();
    expect(
      validateGroupEquitySubtypeTypeCombination(
        AccountType.EQUITY,
        EquityAccountSubtype.EXPENSE,
      ),
    ).toBeNull();
  });

  test("rejects subtype on non-equity accounts and groups", () => {
    expect(
      validateEquitySubtypeTypeCombination(
        AccountType.LIABILITY,
        EquityAccountSubtype.GAIN_LOSS,
      ),
    ).toBe("Equity subtype is only allowed for equity accounts");
    expect(
      validateGroupEquitySubtypeTypeCombination(
        AccountType.ASSET,
        EquityAccountSubtype.OPENING_BALANCES,
      ),
    ).toBe("Equity subtype is only allowed for equity groups");
  });
});

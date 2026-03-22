import { describe, expect, test } from "vitest";
import { AccountType, Unit } from "../.prisma-client/enums";
import {
  validateAccountGroupInput,
  validateAccountGroupParentGroupId,
  validateAccountInput,
  validateAccountTradeCurrency,
  validateAccountUnit,
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
    ).toBe("Trade Currency is required");
  });

  test("allows non-security units without trade currency", () => {
    expect(
      validateAccountTradeCurrency(undefined, Unit.CURRENCY, AccountType.ASSET),
    ).toBeNull();
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
});

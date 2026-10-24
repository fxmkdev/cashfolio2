import { describe, expect, it } from "vitest";
import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
import {
  getAccountConstraintMessage,
  getAccountEntityLabel,
  getAccountManagementContext,
  getAccountManagementPath,
  isBalanceAccount,
  isCategoryAccount,
  isSystemManagedAccount,
} from "./account-presentation";

describe("account roles and presentation", () => {
  it.each([AccountType.BALANCE])(
    "keeps %s a balance account regardless of its balance",
    (type) => {
      const account = { type };
      expect(isBalanceAccount(account)).toBe(true);
      expect(isCategoryAccount(account)).toBe(false);
      expect(isSystemManagedAccount(account)).toBe(false);
      expect(getAccountEntityLabel(account)).toBe("Account");
      expect(getAccountManagementContext(account)).toBe("accounts");
      expect(
        getAccountManagementPath(getAccountManagementContext(account)),
      ).toBe("/$accountBookId/accounts");
    },
  );

  it.each([
    EquityAccountSubtype.INCOME,
    EquityAccountSubtype.EXPENSE,
    EquityAccountSubtype.GAIN_LOSS,
  ])(
    "presents %s as a category while preserving system management",
    (equityAccountSubtype) => {
      const account = { type: AccountType.EQUITY, equityAccountSubtype };
      expect(isBalanceAccount(account)).toBe(false);
      expect(isCategoryAccount(account)).toBe(true);
      expect(getAccountEntityLabel(account)).toBe("Category");
      expect(getAccountManagementContext(account)).toBe("categories");
      expect(
        getAccountManagementPath(getAccountManagementContext(account)),
      ).toBe("/$accountBookId/settings/categories");
      expect(isSystemManagedAccount(account)).toBe(
        equityAccountSubtype === EquityAccountSubtype.GAIN_LOSS,
      );
    },
  );

  it("keeps Opening Balances a protected system account", () => {
    const account = {
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
    };
    expect(isSystemManagedAccount(account)).toBe(true);
    expect(isCategoryAccount(account)).toBe(false);
    expect(getAccountEntityLabel(account)).toBe("Account");
    expect(isCategoryAccount({ type: AccountType.EQUITY })).toBe(false);
  });

  it.each([
    [
      "An account with this name already exists in this group",
      "A category with this name already exists in this category group",
    ],
    [
      "Cannot delete group because it contains accounts",
      "Cannot delete category group because it contains categories",
    ],
    [
      "Account groups cannot contain this group",
      "Category groups cannot contain this category group",
    ],
    ["This account book is busy.", "This account book is busy."],
    ["An account book was not found.", "An account book was not found."],
    [
      "Gain/Loss category groups are system-managed.",
      "Gain/Loss category groups are system-managed.",
    ],
  ])(
    "translates constraints without changing account book terminology: %s",
    (message, expected) => {
      expect(getAccountConstraintMessage(message, "categories")).toBe(expected);
      expect(getAccountConstraintMessage(message, "accounts")).toBe(message);
    },
  );

  it("preserves absent constraint messages", () => {
    expect(getAccountConstraintMessage(null, "categories")).toBeUndefined();
    expect(getAccountConstraintMessage(undefined, "accounts")).toBeUndefined();
  });
});

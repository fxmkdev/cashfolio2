import { describe, expect, it } from "vitest";
import { isAccountGroupCompatible } from "./account-presentation";
import {
  transformAccountValues,
  toFormValues,
} from "../components/account-editor/values";
import {
  validateAccountCashAccountFlag,
  validateAccountGroupCashAccountFlag,
} from "./account-validation";

describe("balance account management", () => {
  it("allows balance accounts in balance groups", () => {
    const type = "BALANCE";
    expect(isAccountGroupCompatible({ type }, { type: "BALANCE" })).toBe(true);
    expect(
      isAccountGroupCompatible(
        { type },
        { type: "EQUITY", equityAccountSubtype: "INCOME" },
      ),
    ).toBe(false);
    expect(validateAccountCashAccountFlag(true, "CURRENCY", type)).toBeNull();
    expect(
      validateAccountCashAccountFlag(true, "SECURITY", type),
    ).not.toBeNull();
    expect(validateAccountGroupCashAccountFlag(true, type)).toBeNull();
  });

  it("keeps categories separate and preserves category subtype compatibility", () => {
    const category = {
      type: "EQUITY",
      equityAccountSubtype: "EXPENSE",
    } as const;
    expect(isAccountGroupCompatible(category, { type: "BALANCE" })).toBe(false);
    expect(
      isAccountGroupCompatible(category, {
        type: "EQUITY",
        equityAccountSubtype: "INCOME",
      }),
    ).toBe(false);
    expect(
      isAccountGroupCompatible(category, {
        type: "EQUITY",
        equityAccountSubtype: null,
      }),
    ).toBe(true);
  });

  it("preserves signed balances when creating and editing balance accounts", () => {
    const created = transformAccountValues({
      typeDescriptor: "BALANCE",
      unit: "CURRENCY",
      currency: "CHF",
      openingBalance: -100,
    });
    expect(created).toMatchObject({
      type: "BALANCE",
      openingBalance: -100,
      isCashAccount: false,
    });
    const edited = transformAccountValues(
      toFormValues({
        name: "Card",
        type: "BALANCE",
        unit: "CURRENCY",
        currency: "CHF",
        openingBalance: 50,
        isCashAccount: true,
      }),
    );
    expect(edited).toMatchObject({
      type: "BALANCE",
      openingBalance: 50,
      isCashAccount: true,
    });
  });
});

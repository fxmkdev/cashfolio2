import { describe, expect, it } from "vitest";
import { getPersistedAccountTypeFilter } from "./account-tabs";
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
  it("selects only balance types while retaining legacy query scopes", () => {
    expect(getPersistedAccountTypeFilter("BALANCE")).toEqual({
      in: ["ASSET", "LIABILITY"],
    });
    expect(getPersistedAccountTypeFilter("LIABILITY")).toBe("LIABILITY");
    expect(getPersistedAccountTypeFilter()).toBeUndefined();
  });

  it.each(["ASSET", "LIABILITY"] as const)(
    "allows %s accounts in either balance group",
    (type) => {
      expect(isAccountGroupCompatible({ type }, { type: "ASSET" })).toBe(true);
      expect(isAccountGroupCompatible({ type }, { type: "LIABILITY" })).toBe(
        true,
      );
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
    },
  );

  it("keeps categories separate and preserves category subtype compatibility", () => {
    const category = {
      type: "EQUITY",
      equityAccountSubtype: "EXPENSE",
    } as const;
    expect(isAccountGroupCompatible(category, { type: "ASSET" })).toBe(false);
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

  it("creates negative balances using the compatibility type without reclassifying edits", () => {
    const created = transformAccountValues({
      typeDescriptor: "BALANCE",
      unit: "CURRENCY",
      currency: "CHF",
      openingBalance: -100,
    });
    expect(created).toMatchObject({
      type: "ASSET",
      openingBalance: -100,
      isCashAccount: false,
    });
    const edited = transformAccountValues(
      toFormValues({
        name: "Card",
        type: "LIABILITY",
        unit: "CURRENCY",
        currency: "CHF",
        openingBalance: 50,
        isCashAccount: true,
      }),
    );
    expect(edited).toMatchObject({
      type: "LIABILITY",
      openingBalance: 50,
      isCashAccount: true,
    });
  });
});

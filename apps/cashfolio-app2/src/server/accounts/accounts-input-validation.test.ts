import { describe, expect, it } from "vitest";
import { AccountTrackingMethod, AssetClass } from "../../.prisma-client/enums";
import {
  validateAccountBookNodeIdInput,
  validateAccountGroupMutationInput,
  validateAccountGroupUpdateInput,
  validateAccountMutationInput,
  validateAccountUpdateInput,
  validateReorderAccountTreeItemsInput,
} from "./accounts-input-validation";

const account = {
  accountBookId: "book-1",
  name: "Savings",
  type: "BALANCE",
  unit: "CURRENCY",
  currency: "CHF",
};
const csv = {
  hasHeader: true,
  delimitersToGuess: [","],
  columns: ["date", "amount"],
};

describe("account mutation input contracts", () => {
  it.each(Object.values(AssetClass))("accepts asset class %s", (assetClass) => {
    expect(
      validateAccountMutationInput({ ...account, assetClass }).assetClass,
    ).toBe(assetClass);
  });

  it("preserves omitted classification and explicit clearing", () => {
    expect(validateAccountMutationInput(account).assetClass).toBeUndefined();
    expect(
      validateAccountUpdateInput({ ...account, id: "a", assetClass: null })
        .assetClass,
    ).toBeNull();
  });
  it.each(["ASSET", "LIABILITY"])(
    "rejects obsolete %s mutation types",
    (type) => {
      for (const validate of [
        validateAccountMutationInput,
        validateAccountGroupMutationInput,
      ]) {
        expect(() => validate({ ...account, type })).toThrow();
      }
      for (const validate of [
        validateAccountUpdateInput,
        validateAccountGroupUpdateInput,
      ]) {
        expect(() => validate({ ...account, id: "existing", type })).toThrow();
      }
    },
  );
  it("preserves omitted update fields and strips unrecognized fields", () => {
    const parsed = validateAccountUpdateInput({
      accountBookId: "book-1",
      id: "account-1",
      name: "Renamed",
      type: "BALANCE",
      bookings: [{ value: 10 }],
    });
    expect(parsed).toMatchObject({ id: "account-1", name: "Renamed" });
    expect(parsed.unit).toBeUndefined();
    expect(parsed.isCashAccount).toBeUndefined();
    expect(parsed.openingBalance).toBeUndefined();
    expect(parsed.statementImportCsvFormat).toBeUndefined();
    expect(parsed).not.toHaveProperty("bookings");
  });

  it("accepts all supported account fields and nullable reset values", () => {
    const input = {
      ...account,
      groupId: "group-1",
      sortOrder: 0,
      isCashAccount: false,
      openingBalance: -12.5,
      cryptocurrency: "BTC",
      symbol: "AAPL",
      tradeCurrency: "USD",
      statementImportCsvFormat: csv,
    };
    expect(validateAccountMutationInput(input)).toMatchObject(input);
    expect(
      validateAccountMutationInput({
        ...account,
        openingBalance: null,
        statementImportCsvFormat: null,
      }),
    ).toMatchObject({ openingBalance: null, statementImportCsvFormat: null });
  });

  it.each([
    ["accountBookId", " "],
    ["name", 1],
    ["name", " "],
    ["type", "EXPENSE"],
    ["equityAccountSubtype", "OTHER"],
    ["unit", "STOCK"],
    ["assetClass", "UNCLASSIFIED"],
    ["assetClass", ""],
    ["assetClass", 1],
    ["groupId", ""],
    ["currency", 1],
    ["cryptocurrency", false],
    ["symbol", {}],
    ["tradeCurrency", []],
    ["isCashAccount", "true"],
    ["isCashAccount", null],
    ["openingBalance", "1.25"],
    ["openingBalance", NaN],
    ["openingBalance", Infinity],
    ["sortOrder", 1.5],
    ["sortOrder", 2147483648],
    ["sortOrder", -2147483649],
    ["sortOrder", NaN],
    ["sortOrder", null],
    ["statementImportCsvFormat", { ...csv, hasHeader: "true" }],
    ["statementImportCsvFormat", { ...csv, columns: ["date", "unknown"] }],
    [
      "statementImportCsvFormat",
      {
        ...csv,
        mappings: { date: 0, amount: { mode: "signed", column: -1 } },
      },
    ],
  ])("rejects malformed %s (%j)", (field, value) => {
    const input = { ...account, [field as string]: value };
    expect(() => validateAccountMutationInput(input)).toThrow();
    expect(() =>
      validateAccountUpdateInput({ ...input, id: "account-1" }),
    ).toThrow();
  });

  it("accepts every account and unit enum variant", () => {
    for (const type of ["BALANCE", "EQUITY"]) {
      expect(validateAccountMutationInput({ ...account, type }).type).toBe(
        type,
      );
    }
    for (const unit of ["CURRENCY", "CRYPTOCURRENCY", "SECURITY"]) {
      expect(validateAccountMutationInput({ ...account, unit }).unit).toBe(
        unit,
      );
    }
    for (const equityAccountSubtype of [
      "INCOME",
      "EXPENSE",
      "GAIN_LOSS",
      "OPENING_BALANCES",
    ]) {
      expect(
        validateAccountMutationInput({
          accountBookId: "book-1",
          name: "Equity",
          type: "EQUITY",
          equityAccountSubtype,
        }).equityAccountSubtype,
      ).toBe(equityAccountSubtype);
    }
  });

  it("preserves explicit null group IDs used to clear a parent", () => {
    expect(
      validateAccountUpdateInput({ ...account, id: "account-1", groupId: null })
        .groupId,
    ).toBeNull();
    expect(
      validateAccountGroupUpdateInput({
        ...account,
        id: "group-1",
        parentGroupId: null,
      }).parentGroupId,
    ).toBeNull();
  });

  it("parses group fields without defaulting omitted update flags", () => {
    const input = {
      accountBookId: "book-1",
      name: "Income",
      type: "EQUITY",
      equityAccountSubtype: "INCOME",
      parentGroupId: "parent-1",
      sortOrder: 2,
      isCashAccount: false,
      isActive: true,
    };
    expect(validateAccountGroupMutationInput(input)).toEqual(input);
    expect(
      validateAccountGroupUpdateInput({ ...input, id: "group-1" }),
    ).toEqual({ ...input, id: "group-1" });
    expect(
      validateAccountGroupUpdateInput({
        ...input,
        id: "group-1",
        isActive: undefined,
      }).isActive,
    ).toBeUndefined();
  });

  it.each([
    ["name", undefined],
    ["accountBookId", null],
    ["type", "OTHER"],
    ["equityAccountSubtype", null],
    ["sortOrder", Infinity],
    ["parentGroupId", " "],
    ["isCashAccount", 1],
    ["isActive", "false"],
  ])("rejects malformed group %s", (field, value) => {
    const input = {
      accountBookId: "book-1",
      name: "Group",
      type: "BALANCE",
      [field as string]: value,
    };
    expect(() => validateAccountGroupMutationInput(input)).toThrow();
    expect(() =>
      validateAccountGroupUpdateInput({ ...input, id: "group-1" }),
    ).toThrow();
  });

  it.each([null, undefined, [], 1, "account"])(
    "rejects non-object inputs (%j)",
    (input) => {
      for (const validate of [
        validateAccountMutationInput,
        validateAccountGroupMutationInput,
        validateAccountBookNodeIdInput,
        validateAccountUpdateInput,
        validateAccountGroupUpdateInput,
        validateReorderAccountTreeItemsInput,
      ]) {
        expect(() => validate(input)).toThrow("Input must be an object.");
      }
    },
  );

  it("requires node IDs for updates and status/deletion operations", () => {
    expect(
      validateAccountBookNodeIdInput({
        id: "node-1",
        accountBookId: "book-1",
        ignored: 1,
      }),
    ).toEqual({ id: "node-1", accountBookId: "book-1" });
    expect(() => validateAccountBookNodeIdInput({ id: "node-1" })).toThrow(
      "Account book id is required.",
    );
    expect(() =>
      validateAccountBookNodeIdInput({ accountBookId: "book-1" }),
    ).toThrow("Node id is required.");
    expect(() => validateAccountUpdateInput(account)).toThrow(
      "Account id is required.",
    );
    expect(() => validateAccountGroupUpdateInput(account)).toThrow(
      "Account group id is required.",
    );
  });

  it("validates every reorder item and strips unknown properties", () => {
    expect(
      validateReorderAccountTreeItemsInput({
        accountBookId: "book-1",
        updates: [
          { id: "account-1", nodeType: "account", sortOrder: 0, ignored: true },
          { id: "group-1", nodeType: "accountGroup", sortOrder: 1 },
        ],
      }).updates,
    ).toEqual([
      { id: "account-1", nodeType: "account", sortOrder: 0 },
      { id: "group-1", nodeType: "accountGroup", sortOrder: 1 },
    ]);
    for (const update of [
      null,
      {},
      { id: "a", nodeType: "other", sortOrder: 1 },
      { id: "a", nodeType: "account", sortOrder: 0.5 },
    ]) {
      expect(() =>
        validateReorderAccountTreeItemsInput({
          accountBookId: "book-1",
          updates: [update],
        }),
      ).toThrow();
    }
    expect(() =>
      validateReorderAccountTreeItemsInput({
        accountBookId: "book-1",
        updates: {},
      }),
    ).toThrow("Updates are required.");
  });
});

describe("tracking method input", () => {
  it.each(Object.values(AccountTrackingMethod))(
    "accepts %s",
    (trackingMethod) => {
      expect(
        validateAccountMutationInput({ ...account, trackingMethod })
          .trackingMethod,
      ).toBe(trackingMethod);
    },
  );
  it("preserves omission and rejects invalid values", () => {
    expect(
      validateAccountMutationInput(account).trackingMethod,
    ).toBeUndefined();
    for (const trackingMethod of [null, "", "PORTFOLIO", true]) {
      expect(() =>
        validateAccountMutationInput({ ...account, trackingMethod }),
      ).toThrow();
    }
  });
});

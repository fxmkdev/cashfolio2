import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import { defaultAssetClassIds } from "../../shared/classification/asset-class";
import {
  createAccount,
  invalidatePeriodBaseDataCacheForAccountBook,
  resetAccountMutation,
  tx,
  updateAccount,
  validateAccountInput,
} from "./accounts-mutations.test-support";

describe("updateAccount opening balance management", () => {
  beforeEach(resetAccountMutation);

  it.each([
    {
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.INCOME,
      isActive: true,
    },
    { type: AccountType.BALANCE, equityAccountSubtype: null, isActive: false },
  ])(
    "rejects an incompatible parent before creating an account: %j",
    async (parent) => {
      tx.accountGroup.findUniqueOrThrow.mockResolvedValueOnce({
        ...parent,
        isCashAccount: false,
      });
      await expect(
        createAccount({
          data: {
            accountBookId: "book-1",
            name: "Bank",
            type: AccountType.BALANCE,
            unit: Unit.CURRENCY,
            currency: "CHF",
            groupId: "parent",
          },
        }),
      ).rejects.toThrow();
      expect(tx.account.create).not.toHaveBeenCalled();
    },
  );

  it("rejects parents outside the current account book", async () => {
    tx.accountGroup.findUniqueOrThrow.mockRejectedValueOnce(
      new Error("Record not found"),
    );
    await expect(
      createAccount({
        data: {
          accountBookId: "book-1",
          name: "Bank",
          type: AccountType.BALANCE,
          unit: Unit.CURRENCY,
          currency: "CHF",
          groupId: "foreign-parent",
        },
      }),
    ).rejects.toThrow("Record not found");
    expect(tx.account.create).not.toHaveBeenCalled();
  });

  it("updates editable account fields without rewriting unit identity fields", async () => {
    await updateAccount({
      data: {
        id: "account-1",
        accountBookId: "book-1",
        name: "Cash renamed",
        type: AccountType.BALANCE,
        groupId: "group-1",
        sortOrder: 7,
      },
    });

    expect(validateAccountInput).toHaveBeenCalledWith(
      expect.objectContaining({
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: undefined,
        symbol: undefined,
        tradeCurrency: undefined,
        isCashAccount: false,
      }),
      [],
    );
    expect(tx.account.update).toHaveBeenCalledWith({
      where: {
        id_accountBookId: { id: "account-1", accountBookId: "book-1" },
      },
      data: expect.objectContaining({
        name: "Cash renamed",
        groupId: "group-1",
        sortOrder: 7,
        isCashAccount: false,
      }),
    });
  });

  it.each([undefined, null, ...Object.values(defaultAssetClassIds)])(
    "creates accounts with explicit classification %s",
    async (assetClassId) => {
      await createAccount({
        data: {
          accountBookId: "book-1",
          name: "Portfolio",
          type: AccountType.BALANCE,
          unit: Unit.CURRENCY,
          currency: "CHF",
          assetClassId,
        },
      });
      expect(tx.account.create).toHaveBeenCalledWith({
        data: expect.not.objectContaining({ assetClassId: expect.anything() }),
      });
      if (assetClassId)
        expect(tx.accountClassification.createMany).toHaveBeenCalledWith({
          data: [expect.objectContaining({ nodeId: assetClassId })],
        });
      else expect(tx.accountClassification.createMany).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, null, defaultAssetClassIds.OTHER_ASSETS])(
    "updates classification %s without rewriting valuation or bookings",
    async (assetClassId) => {
      tx.account.findUniqueOrThrow.mockResolvedValueOnce({
        type: AccountType.BALANCE,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        statementImportCsvFormat: null,
        isCashAccount: false,
        classifications: [{ nodeId: defaultAssetClassIds.EQUITIES }],
      });
      await updateAccount({
        data: {
          id: "account-1",
          accountBookId: "book-1",
          name: "Portfolio",
          type: AccountType.BALANCE,
          assetClassId,
        },
      });
      const written = tx.account.update.mock.calls[0]![0].data;
      const expectedClass =
        assetClassId === undefined
          ? defaultAssetClassIds.EQUITIES
          : assetClassId;
      if (expectedClass)
        expect(tx.accountClassification.createMany).toHaveBeenCalledWith({
          data: [expect.objectContaining({ nodeId: expectedClass })],
        });
      else expect(tx.accountClassification.createMany).not.toHaveBeenCalled();
      expect(written).not.toHaveProperty("assetClassId");
      expect(written).not.toHaveProperty("unit");
      expect(written).not.toHaveProperty("currency");
      expect(written.isCashAccount).toBe(false);
      expect(tx.transaction.create).not.toHaveBeenCalled();
      expect(tx.transaction.update).not.toHaveBeenCalled();
      expect(tx.transaction.deleteMany).not.toHaveBeenCalled();
      expect(tx.booking.deleteMany).not.toHaveBeenCalled();
      expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
        "book-1",
      );
    },
  );

  it.each([undefined, "INDIVIDUAL_UNITS", "TOTAL_PORTFOLIO_VALUE"] as const)(
    "preserves or updates tracking method %s without rewriting bookings",
    async (trackingMethod) => {
      tx.account.findUniqueOrThrow.mockResolvedValueOnce({
        type: AccountType.BALANCE,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "USD",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        statementImportCsvFormat: null,
        isCashAccount: false,
        classifications: [{ nodeId: defaultAssetClassIds.EQUITIES }],
        trackingMethod: "TOTAL_PORTFOLIO_VALUE",
      });
      await updateAccount({
        data: {
          id: "account-1",
          accountBookId: "book-1",
          name: "Portfolio",
          type: AccountType.BALANCE,
          trackingMethod,
        },
      });
      expect(tx.account.update.mock.calls[0]![0].data.trackingMethod).toBe(
        trackingMethod ?? "TOTAL_PORTFOLIO_VALUE",
      );
      expect(tx.booking.deleteMany).not.toHaveBeenCalled();
      expect(tx.transaction.create).not.toHaveBeenCalled();
      expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
        "book-1",
      );
    },
  );

  it("creates an explicitly managed portfolio", async () => {
    await createAccount({
      data: {
        accountBookId: "book-1",
        name: "Portfolio",
        type: AccountType.BALANCE,
        unit: Unit.CURRENCY,
        currency: "USD",
        trackingMethod: "TOTAL_PORTFOLIO_VALUE",
      },
    });
    expect(tx.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        trackingMethod: "TOTAL_PORTFOLIO_VALUE",
      }),
    });
  });

  it("ignores stale submitted unit identity fields when updating unitless equity accounts", async () => {
    const actual = await vi.importActual<
      typeof import("../../shared/accounts/account-validation")
    >("../../shared/accounts/account-validation");
    validateAccountInput.mockImplementationOnce(actual.validateAccountInput);
    tx.account.findUniqueOrThrow.mockResolvedValueOnce({
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
      unit: null,
      currency: null,
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
    });
    tx.account.update.mockResolvedValueOnce({
      id: "account-1",
      name: "Groceries renamed",
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
      unit: null,
      currency: null,
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
    });

    await updateAccount({
      data: {
        id: "account-1",
        accountBookId: "book-1",
        name: "Groceries renamed",
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.EXPENSE,
        groupId: "group-expenses",
        sortOrder: 2,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: "BTC",
        symbol: "AAPL",
        tradeCurrency: "USD",
      },
    });

    expect(validateAccountInput).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.EXPENSE,
        unit: undefined,
        currency: undefined,
        cryptocurrency: undefined,
        symbol: undefined,
        tradeCurrency: undefined,
        isCashAccount: false,
      }),
      [],
    );
    expect(tx.account.update).toHaveBeenCalledWith({
      where: {
        id_accountBookId: { id: "account-1", accountBookId: "book-1" },
      },
      data: expect.objectContaining({
        name: "Groceries renamed",
        groupId: "group-expenses",
        sortOrder: 2,
        isCashAccount: false,
      }),
    });
  });

  it("stores newly created equity accounts without hidden unit identity fields", async () => {
    const actual = await vi.importActual<
      typeof import("../../shared/accounts/account-validation")
    >("../../shared/accounts/account-validation");
    validateAccountInput.mockImplementationOnce(actual.validateAccountInput);
    tx.account.create.mockResolvedValueOnce({
      id: "account-2",
      name: "Groceries",
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
      unit: null,
      currency: null,
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
    });

    await createAccount({
      data: {
        accountBookId: "book-1",
        name: "Groceries",
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.EXPENSE,
        groupId: "group-expenses",
        sortOrder: 1,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: "BTC",
        symbol: "AAPL",
        tradeCurrency: "USD",
      },
    });

    expect(validateAccountInput).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.EXPENSE,
        unit: undefined,
        currency: undefined,
        cryptocurrency: undefined,
        symbol: undefined,
        tradeCurrency: undefined,
        isCashAccount: false,
      }),
      [],
    );
    expect(tx.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Groceries",
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.EXPENSE,
        groupId: "group-expenses",
        sortOrder: 1,
        unit: undefined,
        currency: undefined,
        cryptocurrency: undefined,
        symbol: undefined,
        tradeCurrency: undefined,
        isCashAccount: false,
        accountBookId: "book-1",
      }),
    });
  });

  it.each([
    ["unit", { unit: Unit.CRYPTOCURRENCY }],
    ["currency", { currency: "USD" }],
    ["cryptocurrency", { cryptocurrency: "BTC" }],
    ["symbol", { symbol: "AAPL" }],
    ["trade currency", { tradeCurrency: "USD" }],
  ])("rejects changing account %s after creation", async (_label, change) => {
    await expect(
      updateAccount({
        data: {
          id: "account-1",
          accountBookId: "book-1",
          name: "Cash",
          type: AccountType.BALANCE,
          ...change,
        },
      }),
    ).rejects.toThrow("Account unit cannot be changed");

    expect(validateAccountInput).not.toHaveBeenCalled();
    expect(tx.account.update).not.toHaveBeenCalled();
    expect(tx.transaction.update).not.toHaveBeenCalled();
    expect(invalidatePeriodBaseDataCacheForAccountBook).not.toHaveBeenCalled();
  });
});

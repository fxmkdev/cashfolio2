import { beforeEach, describe, expect, it } from "vitest";
import { AccountType, Unit } from "../../.prisma-client/enums";
import {
  createAccount,
  resetAccountMutation,
  tx,
  updateAccount,
  validateAccountInput,
} from "./accounts-mutations.test-support";

describe("updateAccount opening balance management", () => {
  beforeEach(resetAccountMutation);

  it.each([AccountType.BALANCE])(
    "creates accounts in a %s parent with explicit cash inheritance",
    async (parentType) => {
      tx.accountGroup.findUniqueOrThrow.mockResolvedValueOnce({
        type: parentType,
        equityAccountSubtype: null,
        isActive: true,
        isCashAccount: true,
      });
      await createAccount({
        data: {
          accountBookId: "book-1",
          name: "Card",
          type: AccountType.BALANCE,
          unit: Unit.CURRENCY,
          currency: "CHF",
          groupId: "banking",
        },
      });
      expect(tx.account.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: AccountType.BALANCE,
          groupId: "banking",
          isCashAccount: true,
        }),
      });
      expect(tx.accountGroup.findUniqueOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id_accountBookId: { id: "banking", accountBookId: "book-1" },
          },
        }),
      );
    },
  );

  it("persists cash flag for currency accounts", async () => {
    tx.account.create.mockResolvedValueOnce({
      id: "account-3",
      name: "Checking",
      type: AccountType.BALANCE,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      isCashAccount: true,
    });

    await createAccount({
      data: {
        accountBookId: "book-1",
        name: "Checking",
        type: AccountType.BALANCE,
        unit: Unit.CURRENCY,
        currency: "CHF",
        isCashAccount: true,
      },
    });

    expect(validateAccountInput).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AccountType.BALANCE,
        unit: Unit.CURRENCY,
        currency: "CHF",
        isCashAccount: true,
      }),
      [],
    );
    expect(tx.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Checking",
          isCashAccount: true,
        }),
      }),
    );
  });

  it("inherits cash status when creating accounts inside cash groups", async () => {
    tx.accountGroup.findUniqueOrThrow.mockResolvedValueOnce({
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      isActive: true,
      isCashAccount: true,
    });

    await createAccount({
      data: {
        accountBookId: "book-1",
        name: "Wallet",
        type: AccountType.BALANCE,
        unit: Unit.CURRENCY,
        currency: "CHF",
        groupId: "cash-group",
        isCashAccount: false,
      },
    });

    expect(tx.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        groupId: "cash-group",
        isCashAccount: true,
      }),
    });
  });

  it("inherits cash status when moving accounts into cash groups", async () => {
    tx.accountGroup.findUniqueOrThrow.mockResolvedValueOnce({
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      isActive: true,
      isCashAccount: true,
    });

    await updateAccount({
      data: {
        id: "account-1",
        accountBookId: "book-1",
        name: "Cash",
        type: AccountType.BALANCE,
        groupId: "cash-group",
        isCashAccount: false,
      },
    });

    expect(tx.account.update).toHaveBeenCalledWith({
      where: {
        id_accountBookId: { id: "account-1", accountBookId: "book-1" },
      },
      data: expect.objectContaining({
        groupId: "cash-group",
        isCashAccount: true,
      }),
    });
  });

  it("preserves cash status when updating accounts without a cash flag", async () => {
    tx.account.findUniqueOrThrow.mockResolvedValueOnce({
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      statementImportCsvFormat: null,
      isCashAccount: true,
    });

    await updateAccount({
      data: {
        id: "account-1",
        accountBookId: "book-1",
        name: "Cash renamed",
        type: AccountType.BALANCE,
        groupId: null,
      },
    });

    expect(validateAccountInput).toHaveBeenCalledWith(
      expect.objectContaining({ isCashAccount: true }),
      [],
    );
    expect(tx.account.update).toHaveBeenCalledWith({
      where: {
        id_accountBookId: { id: "account-1", accountBookId: "book-1" },
      },
      data: expect.objectContaining({
        name: "Cash renamed",
        isCashAccount: true,
      }),
    });
  });
});

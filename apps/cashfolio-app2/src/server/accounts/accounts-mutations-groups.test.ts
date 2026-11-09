import { beforeEach, describe, expect, it } from "vitest";
import { AccountType, Unit } from "../../.prisma-client/enums";
import {
  createAccountGroup,
  invalidatePeriodBaseDataCacheForAccountBook,
  resetAccountGroup,
  tx,
  updateAccountGroup,
  validateAccountGroupInput,
} from "./accounts-mutations.test-support";

describe("createAccountGroup", () => {
  beforeEach(resetAccountGroup);

  it("defaults new groups to active when isActive is omitted", async () => {
    await createAccountGroup({
      data: {
        accountBookId: "book-1",
        name: "Group",
        type: AccountType.BALANCE,
      },
    });

    expect(tx.accountGroup.create).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        name: "Group",
        type: AccountType.BALANCE,
        equityAccountSubtype: undefined,
        isActive: true,
        parentGroupId: undefined,
        sortOrder: null,
        isCashAccount: false,
      },
    });
    expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
      "book-1",
    );
  });

  it("creates archived groups when isActive is false", async () => {
    await createAccountGroup({
      data: {
        accountBookId: "book-1",
        name: "Archived Group",
        type: AccountType.BALANCE,
        parentGroupId: "parent-1",
        sortOrder: 2,
        isActive: false,
      },
    });

    expect(tx.accountGroup.create).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        name: "Archived Group",
        type: AccountType.BALANCE,
        equityAccountSubtype: undefined,
        isActive: false,
        parentGroupId: "parent-1",
        sortOrder: 2,
        isCashAccount: false,
      },
    });
    expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
      "book-1",
    );
  });

  it("creates root cash groups", async () => {
    await createAccountGroup({
      data: {
        accountBookId: "book-1",
        name: "Cash",
        type: AccountType.BALANCE,
        isCashAccount: true,
      },
    });

    expect(validateAccountGroupInput).toHaveBeenCalledWith(
      expect.objectContaining({ isCashAccount: true }),
      [],
    );
    expect(tx.accountGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Cash",
        isCashAccount: true,
      }),
    });
  });

  it("inherits cash status from parent groups when creating nested groups", async () => {
    tx.accountGroup.findUniqueOrThrow.mockResolvedValueOnce({
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      isActive: true,
      isCashAccount: true,
    });

    await createAccountGroup({
      data: {
        accountBookId: "book-1",
        name: "Wallets",
        type: AccountType.BALANCE,
        parentGroupId: "cash-parent",
        isCashAccount: false,
      },
    });

    expect(tx.accountGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        parentGroupId: "cash-parent",
        isCashAccount: true,
      }),
    });
  });

  it("cascades group cash status when updating groups", async () => {
    await updateAccountGroup({
      data: {
        id: "group-1",
        accountBookId: "book-1",
        name: "Cash",
        type: AccountType.BALANCE,
        isCashAccount: true,
      },
    });

    expect(tx.accountGroup.update).toHaveBeenCalledWith({
      where: {
        id_accountBookId: { id: "group-1", accountBookId: "book-1" },
      },
      data: expect.objectContaining({
        name: "Cash",
        isCashAccount: true,
      }),
    });
    expect(tx.accountGroup.updateMany).toHaveBeenCalledWith({
      where: {
        accountBookId: "book-1",
        id: { in: ["group-1"] },
      },
      data: { isCashAccount: true },
    });
    expect(tx.account.updateMany).toHaveBeenCalledWith({
      where: {
        accountBookId: "book-1",
        groupId: { in: ["group-1"] },
      },
      data: { isCashAccount: true },
    });
  });

  it("preserves and returns group cash status when updating groups without a cash flag", async () => {
    tx.accountGroup.findUniqueOrThrow.mockResolvedValueOnce({
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      isCashAccount: true,
    });
    tx.accountGroup.update.mockImplementationOnce(async ({ data }) => ({
      id: "group-1",
      accountBookId: "book-1",
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      isActive: true,
      parentGroupId: null,
      sortOrder: null,
      ...data,
    }));

    const result = await updateAccountGroup({
      data: {
        id: "group-1",
        accountBookId: "book-1",
        name: "Cash renamed",
        type: AccountType.BALANCE,
      },
    });

    expect(tx.accountGroup.update).toHaveBeenCalledWith({
      where: {
        id_accountBookId: { id: "group-1", accountBookId: "book-1" },
      },
      data: expect.objectContaining({
        name: "Cash renamed",
        isCashAccount: true,
      }),
    });
    expect(tx.accountGroup.updateMany).toHaveBeenCalledWith({
      where: {
        accountBookId: "book-1",
        id: { in: ["group-1"] },
      },
      data: { isCashAccount: true },
    });
    expect(result).toEqual(
      expect.objectContaining({
        name: "Cash renamed",
        isCashAccount: true,
      }),
    );
  });

  it("cascades non-cash status when unmarking groups", async () => {
    await updateAccountGroup({
      data: {
        id: "group-1",
        accountBookId: "book-1",
        name: "Assets",
        type: AccountType.BALANCE,
        isCashAccount: false,
      },
    });

    expect(tx.accountGroup.updateMany).toHaveBeenCalledWith({
      where: {
        accountBookId: "book-1",
        id: { in: ["group-1"] },
      },
      data: { isCashAccount: false },
    });
    expect(tx.account.updateMany).toHaveBeenCalledWith({
      where: {
        accountBookId: "book-1",
        groupId: { in: ["group-1"] },
      },
      data: { isCashAccount: false },
    });
  });

  it("rejects marking a group cash when its subtree has non-cashable accounts", async () => {
    tx.account.findMany.mockResolvedValueOnce([
      { type: AccountType.BALANCE, unit: Unit.SECURITY },
    ]);

    await expect(
      updateAccountGroup({
        data: {
          id: "group-1",
          accountBookId: "book-1",
          name: "Cash",
          type: AccountType.BALANCE,
          isCashAccount: true,
        },
      }),
    ).rejects.toThrow(
      "Groups included in cash flow must contain only currency accounts",
    );

    expect(tx.accountGroup.update).not.toHaveBeenCalled();
    expect(tx.accountGroup.updateMany).not.toHaveBeenCalled();
  });
});

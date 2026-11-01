import { describe, expect, test, vi } from "vitest";
import { AccountType, Unit } from "@/.prisma-client/enums";

vi.mock("@/server/accounts", () => ({
  archiveAccount: vi.fn(),
  archiveAccountGroup: vi.fn(),
  createAccount: vi.fn(),
  createAccountGroup: vi.fn(),
  deleteAccount: vi.fn(),
  deleteAccountGroup: vi.fn(),
  getAccountTreeData: vi.fn(),
  reorderAccountTreeItems: vi.fn(),
  unarchiveAccount: vi.fn(),
  unarchiveAccountGroup: vi.fn(),
  updateAccount: vi.fn(),
  updateAccountGroup: vi.fn(),
}));

import {
  createAccountsMutationActions,
  type AccountsMutationApi,
  type AccountsMutationState,
} from "./-account-mutations";

function createActions(overrides: Partial<AccountsMutationState> = {}) {
  const invalidate = vi.fn();
  const state = {
    getEditingAccount: vi.fn<AccountsMutationState["getEditingAccount"]>(),
    getEditingGroup: vi.fn<AccountsMutationState["getEditingGroup"]>(),
    getDeletingRow: vi.fn<AccountsMutationState["getDeletingRow"]>(),
    getArchivingRow: vi.fn<AccountsMutationState["getArchivingRow"]>(),
    setCreateModalOpened: vi.fn(),
    setEditModalOpen: vi.fn(),
    setCreateGroupModalOpened: vi.fn(),
    setEditGroupModalOpen: vi.fn(),
    setDeletingRow: vi.fn<AccountsMutationState["setDeletingRow"]>(),
    setArchivingRow: vi.fn<AccountsMutationState["setArchivingRow"]>(),
    ...overrides,
  } satisfies AccountsMutationState;
  const api = {
    createAccount: vi.fn<AccountsMutationApi["createAccount"]>(),
    updateAccount: vi.fn<AccountsMutationApi["updateAccount"]>(),
    createAccountGroup: vi.fn<AccountsMutationApi["createAccountGroup"]>(),
    updateAccountGroup: vi.fn<AccountsMutationApi["updateAccountGroup"]>(),
    deleteAccount: vi.fn<AccountsMutationApi["deleteAccount"]>(),
    deleteAccountGroup: vi.fn<AccountsMutationApi["deleteAccountGroup"]>(),
    archiveAccount: vi.fn<AccountsMutationApi["archiveAccount"]>(),
    archiveAccountGroup: vi.fn<AccountsMutationApi["archiveAccountGroup"]>(),
    unarchiveAccount: vi.fn<AccountsMutationApi["unarchiveAccount"]>(),
    unarchiveAccountGroup:
      vi.fn<AccountsMutationApi["unarchiveAccountGroup"]>(),
    reorderAccountTreeItems:
      vi.fn<AccountsMutationApi["reorderAccountTreeItems"]>(),
  } satisfies AccountsMutationApi;
  const actions = createAccountsMutationActions({
    accountBookId: "book-1",
    invalidate,
    state,
    api,
  });
  return { actions, state, api, invalidate };
}

describe("createAccountsMutationActions", () => {
  test("creates an account, closes create modal, and invalidates", async () => {
    const { actions, state, api, invalidate } = createActions();

    await actions.handleCreateAccount({
      name: "Cash",
      typeDescriptor: "BALANCE",
      type: AccountType.BALANCE,
      equityAccountSubtype: undefined,
      groupId: "group-1",
      sortOrder: 2,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: undefined,
      symbol: undefined,
      tradeCurrency: undefined,
      openingBalance: undefined,
    });

    expect(api.createAccount).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        name: "Cash",
        type: AccountType.BALANCE,
        equityAccountSubtype: undefined,
        groupId: "group-1",
        sortOrder: 2,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: undefined,
        symbol: undefined,
        tradeCurrency: undefined,
        openingBalance: undefined,
      },
    });
    expect(state.setCreateModalOpened).toHaveBeenCalledWith(false);
    expect(invalidate).toHaveBeenCalledOnce();
  });

  test("creates an active group by default", async () => {
    const { actions, state, api, invalidate } = createActions();

    await actions.handleCreateGroup({
      name: "Bank",
      typeDescriptor: "BALANCE",
      type: AccountType.BALANCE,
      equityAccountSubtype: undefined,
      parentGroupId: undefined,
      sortOrder: 0,
    });

    expect(api.createAccountGroup).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        name: "Bank",
        type: AccountType.BALANCE,
        equityAccountSubtype: undefined,
        parentGroupId: undefined,
        sortOrder: 0,
        isActive: true,
      },
    });
    expect(state.setCreateGroupModalOpened).toHaveBeenCalledWith(false);
    expect(invalidate).toHaveBeenCalledOnce();
  });

  test("creates active category groups", async () => {
    const { actions, state, api, invalidate } = createActions();

    await actions.handleCreateGroup({
      name: "New Expenses",
      typeDescriptor: "EQUITY-EXPENSE",
      type: AccountType.EQUITY,
      equityAccountSubtype: "EXPENSE",
      parentGroupId: undefined,
      sortOrder: 1,
    });

    expect(api.createAccountGroup).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        name: "New Expenses",
        type: AccountType.EQUITY,
        equityAccountSubtype: "EXPENSE",
        parentGroupId: undefined,
        sortOrder: 1,
        isActive: true,
      },
    });
    expect(state.setCreateGroupModalOpened).toHaveBeenCalledWith(false);
    expect(invalidate).toHaveBeenCalledOnce();
  });

  test("updates account only when editing state is present", async () => {
    let editingAccount: ReturnType<AccountsMutationState["getEditingAccount"]>;
    const { actions, state, api, invalidate } = createActions({
      getEditingAccount: () => editingAccount,
    });

    await actions.handleUpdateAccount({
      name: "Updated",
      typeDescriptor: "BALANCE",
      type: AccountType.BALANCE,
      equityAccountSubtype: undefined,
      groupId: undefined,
      sortOrder: 0,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: undefined,
      symbol: undefined,
      tradeCurrency: undefined,
      openingBalance: undefined,
    });

    expect(api.updateAccount).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();

    editingAccount = {
      id: "account-1",
      initialValues: { name: "Original", type: AccountType.BALANCE },
    };

    await actions.handleUpdateAccount({
      name: "Updated",
      typeDescriptor: "BALANCE",
      type: AccountType.BALANCE,
      equityAccountSubtype: undefined,
      groupId: undefined,
      sortOrder: 0,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: undefined,
      symbol: undefined,
      tradeCurrency: undefined,
    });

    expect(api.updateAccount).toHaveBeenCalledWith({
      data: {
        id: "account-1",
        accountBookId: "book-1",
        name: "Updated",
        type: AccountType.BALANCE,
        equityAccountSubtype: undefined,
        groupId: undefined,
        sortOrder: 0,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: undefined,
        symbol: undefined,
        tradeCurrency: undefined,
        openingBalance: undefined,
      },
    });
    expect(state.setEditModalOpen).toHaveBeenCalledWith(false);
    expect(invalidate).toHaveBeenCalledOnce();
  });

  test("deletes selected row and resets deletion state", async () => {
    let deletingRow: ReturnType<AccountsMutationState["getDeletingRow"]> = {
      id: "group-1",
      nodeType: "accountGroup",
      name: "Group",
    };
    const { actions, state, api, invalidate } = createActions({
      getDeletingRow: () => deletingRow,
      setDeletingRow: vi.fn((row) => {
        deletingRow = row;
      }),
    });

    await actions.handleDelete();

    expect(api.deleteAccountGroup).toHaveBeenCalledWith({
      data: {
        id: "group-1",
        accountBookId: "book-1",
      },
    });
    expect(state.setDeletingRow).toHaveBeenCalledWith(undefined);
    expect(deletingRow).toBeUndefined();
    expect(invalidate).toHaveBeenCalledOnce();
  });

  test("reorders siblings by emitted index order and invalidates", async () => {
    const { actions, api, invalidate } = createActions();

    await actions.handleReorderSiblings([
      { id: "account-1", nodeType: "account" },
      { id: "group-2", nodeType: "accountGroup" },
    ]);

    expect(api.reorderAccountTreeItems).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        updates: [
          { id: "account-1", nodeType: "account", sortOrder: 0 },
          { id: "group-2", nodeType: "accountGroup", sortOrder: 1 },
        ],
      },
    });
    expect(invalidate).toHaveBeenCalledOnce();
  });
});

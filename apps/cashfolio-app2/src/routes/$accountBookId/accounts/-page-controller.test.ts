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

import { createAccountsMutationActions } from "./-page-controller";

function createActions(args: {
  state: unknown;
  api: unknown;
  invalidate: () => void;
  createGroupIsActive?: boolean;
}) {
  return createAccountsMutationActions({
    accountBookId: "book-1",
    createGroupIsActive: args.createGroupIsActive,
    invalidate: args.invalidate,
    state: args.state as Parameters<
      typeof createAccountsMutationActions
    >[0]["state"],
    api: args.api as Parameters<typeof createAccountsMutationActions>[0]["api"],
  });
}

describe("createAccountsMutationActions", () => {
  test("creates an account, closes create modal, and invalidates", async () => {
    const invalidate = vi.fn();

    let editingAccount:
      | { id: string; initialValues: Record<string, unknown> }
      | undefined;
    let editingGroup:
      | { id: string; initialValues: Record<string, unknown> }
      | undefined;
    let deletingRow:
      | { id: string; nodeType: "account" | "accountGroup"; name: string }
      | undefined;
    let archivingRow:
      | { id: string; nodeType: "account" | "accountGroup"; name: string }
      | undefined;

    const state = {
      getEditingAccount: () => editingAccount,
      getEditingGroup: () => editingGroup,
      getDeletingRow: () => deletingRow,
      getArchivingRow: () => archivingRow,
      setCreateModalOpened: vi.fn(),
      setEditModalOpen: vi.fn(),
      setCreateGroupModalOpened: vi.fn(),
      setEditGroupModalOpen: vi.fn((opened: boolean) => opened),
      setDeletingRow: vi.fn((row) => {
        deletingRow = row;
      }),
      setArchivingRow: vi.fn((row) => {
        archivingRow = row;
      }),
    };

    const api = {
      createAccount: vi.fn().mockResolvedValue(undefined),
      updateAccount: vi.fn().mockResolvedValue(undefined),
      createAccountGroup: vi.fn().mockResolvedValue(undefined),
      updateAccountGroup: vi.fn().mockResolvedValue(undefined),
      deleteAccount: vi.fn().mockResolvedValue(undefined),
      deleteAccountGroup: vi.fn().mockResolvedValue(undefined),
      archiveAccount: vi.fn().mockResolvedValue(undefined),
      archiveAccountGroup: vi.fn().mockResolvedValue(undefined),
      unarchiveAccount: vi.fn().mockResolvedValue(undefined),
      unarchiveAccountGroup: vi.fn().mockResolvedValue(undefined),
      reorderAccountTreeItems: vi.fn().mockResolvedValue(undefined),
    };

    const actions = createActions({ invalidate, state, api });

    await actions.handleCreateAccount({
      name: "Cash",
      typeDescriptor: "ASSET",
      type: AccountType.ASSET,
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
        type: AccountType.ASSET,
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
    const invalidate = vi.fn();
    const state = {
      getEditingAccount: () => undefined,
      getEditingGroup: () => undefined,
      getDeletingRow: () => undefined,
      getArchivingRow: () => undefined,
      setCreateModalOpened: vi.fn(),
      setEditModalOpen: vi.fn(),
      setCreateGroupModalOpened: vi.fn(),
      setEditGroupModalOpen: vi.fn(),
      setDeletingRow: vi.fn(),
      setArchivingRow: vi.fn(),
    };
    const api = {
      createAccount: vi.fn().mockResolvedValue(undefined),
      updateAccount: vi.fn().mockResolvedValue(undefined),
      createAccountGroup: vi.fn().mockResolvedValue(undefined),
      updateAccountGroup: vi.fn().mockResolvedValue(undefined),
      deleteAccount: vi.fn().mockResolvedValue(undefined),
      deleteAccountGroup: vi.fn().mockResolvedValue(undefined),
      archiveAccount: vi.fn().mockResolvedValue(undefined),
      archiveAccountGroup: vi.fn().mockResolvedValue(undefined),
      unarchiveAccount: vi.fn().mockResolvedValue(undefined),
      unarchiveAccountGroup: vi.fn().mockResolvedValue(undefined),
      reorderAccountTreeItems: vi.fn().mockResolvedValue(undefined),
    };
    const actions = createActions({ invalidate, state, api });

    await actions.handleCreateGroup({
      name: "Bank",
      typeDescriptor: "ASSET",
      type: AccountType.ASSET,
      equityAccountSubtype: undefined,
      parentGroupId: undefined,
      sortOrder: 0,
    });

    expect(api.createAccountGroup).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        name: "Bank",
        type: AccountType.ASSET,
        equityAccountSubtype: undefined,
        parentGroupId: undefined,
        sortOrder: 0,
        isActive: true,
      },
    });
    expect(state.setCreateGroupModalOpened).toHaveBeenCalledWith(false);
    expect(invalidate).toHaveBeenCalledOnce();
  });

  test("creates an archived group when configured for archived mode", async () => {
    const invalidate = vi.fn();
    const state = {
      getEditingAccount: () => undefined,
      getEditingGroup: () => undefined,
      getDeletingRow: () => undefined,
      getArchivingRow: () => undefined,
      setCreateModalOpened: vi.fn(),
      setEditModalOpen: vi.fn(),
      setCreateGroupModalOpened: vi.fn(),
      setEditGroupModalOpen: vi.fn(),
      setDeletingRow: vi.fn(),
      setArchivingRow: vi.fn(),
    };
    const api = {
      createAccount: vi.fn().mockResolvedValue(undefined),
      updateAccount: vi.fn().mockResolvedValue(undefined),
      createAccountGroup: vi.fn().mockResolvedValue(undefined),
      updateAccountGroup: vi.fn().mockResolvedValue(undefined),
      deleteAccount: vi.fn().mockResolvedValue(undefined),
      deleteAccountGroup: vi.fn().mockResolvedValue(undefined),
      archiveAccount: vi.fn().mockResolvedValue(undefined),
      archiveAccountGroup: vi.fn().mockResolvedValue(undefined),
      unarchiveAccount: vi.fn().mockResolvedValue(undefined),
      unarchiveAccountGroup: vi.fn().mockResolvedValue(undefined),
      reorderAccountTreeItems: vi.fn().mockResolvedValue(undefined),
    };
    const actions = createActions({
      invalidate,
      state,
      api,
      createGroupIsActive: false,
    });

    await actions.handleCreateGroup({
      name: "Old Banks",
      typeDescriptor: "ASSET",
      type: AccountType.ASSET,
      equityAccountSubtype: undefined,
      parentGroupId: "archived-parent",
      sortOrder: 1,
    });

    expect(api.createAccountGroup).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        name: "Old Banks",
        type: AccountType.ASSET,
        equityAccountSubtype: undefined,
        parentGroupId: "archived-parent",
        sortOrder: 1,
        isActive: false,
      },
    });
    expect(state.setCreateGroupModalOpened).toHaveBeenCalledWith(false);
    expect(invalidate).toHaveBeenCalledOnce();
  });

  test("updates account only when editing state is present", async () => {
    const invalidate = vi.fn();

    let editingAccount:
      | { id: string; initialValues: Record<string, unknown> }
      | undefined = undefined;

    const state = {
      getEditingAccount: () => editingAccount,
      getEditingGroup: () => undefined,
      getDeletingRow: () => undefined,
      getArchivingRow: () => undefined,
      setCreateModalOpened: vi.fn(),
      setEditModalOpen: vi.fn(),
      setCreateGroupModalOpened: vi.fn(),
      setEditGroupModalOpen: vi.fn(),
      setDeletingRow: vi.fn(),
      setArchivingRow: vi.fn(),
    };

    const api = {
      createAccount: vi.fn().mockResolvedValue(undefined),
      updateAccount: vi.fn().mockResolvedValue(undefined),
      createAccountGroup: vi.fn().mockResolvedValue(undefined),
      updateAccountGroup: vi.fn().mockResolvedValue(undefined),
      deleteAccount: vi.fn().mockResolvedValue(undefined),
      deleteAccountGroup: vi.fn().mockResolvedValue(undefined),
      archiveAccount: vi.fn().mockResolvedValue(undefined),
      archiveAccountGroup: vi.fn().mockResolvedValue(undefined),
      unarchiveAccount: vi.fn().mockResolvedValue(undefined),
      unarchiveAccountGroup: vi.fn().mockResolvedValue(undefined),
      reorderAccountTreeItems: vi.fn().mockResolvedValue(undefined),
    };

    const actions = createActions({ invalidate, state, api });

    await actions.handleUpdateAccount({
      name: "Updated",
      typeDescriptor: "ASSET",
      type: AccountType.ASSET,
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

    editingAccount = { id: "account-1", initialValues: {} };

    await actions.handleUpdateAccount({
      name: "Updated",
      typeDescriptor: "ASSET",
      type: AccountType.ASSET,
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
        type: AccountType.ASSET,
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
    const invalidate = vi.fn();
    let deletingRow:
      | { id: string; nodeType: "account" | "accountGroup"; name: string }
      | undefined = {
      id: "group-1",
      nodeType: "accountGroup",
      name: "Group",
    };

    const state = {
      getEditingAccount: () => undefined,
      getEditingGroup: () => undefined,
      getDeletingRow: () => deletingRow,
      getArchivingRow: () => undefined,
      setCreateModalOpened: vi.fn(),
      setEditModalOpen: vi.fn(),
      setCreateGroupModalOpened: vi.fn(),
      setEditGroupModalOpen: vi.fn(),
      setDeletingRow: vi.fn((row) => {
        deletingRow = row;
      }),
      setArchivingRow: vi.fn(),
    };

    const api = {
      createAccount: vi.fn().mockResolvedValue(undefined),
      updateAccount: vi.fn().mockResolvedValue(undefined),
      createAccountGroup: vi.fn().mockResolvedValue(undefined),
      updateAccountGroup: vi.fn().mockResolvedValue(undefined),
      deleteAccount: vi.fn().mockResolvedValue(undefined),
      deleteAccountGroup: vi.fn().mockResolvedValue(undefined),
      archiveAccount: vi.fn().mockResolvedValue(undefined),
      archiveAccountGroup: vi.fn().mockResolvedValue(undefined),
      unarchiveAccount: vi.fn().mockResolvedValue(undefined),
      unarchiveAccountGroup: vi.fn().mockResolvedValue(undefined),
      reorderAccountTreeItems: vi.fn().mockResolvedValue(undefined),
    };

    const actions = createActions({ invalidate, state, api });

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
    const invalidate = vi.fn();

    const state = {
      getEditingAccount: () => undefined,
      getEditingGroup: () => undefined,
      getDeletingRow: () => undefined,
      getArchivingRow: () => undefined,
      setCreateModalOpened: vi.fn(),
      setEditModalOpen: vi.fn(),
      setCreateGroupModalOpened: vi.fn(),
      setEditGroupModalOpen: vi.fn(),
      setDeletingRow: vi.fn(),
      setArchivingRow: vi.fn(),
    };

    const api = {
      createAccount: vi.fn().mockResolvedValue(undefined),
      updateAccount: vi.fn().mockResolvedValue(undefined),
      createAccountGroup: vi.fn().mockResolvedValue(undefined),
      updateAccountGroup: vi.fn().mockResolvedValue(undefined),
      deleteAccount: vi.fn().mockResolvedValue(undefined),
      deleteAccountGroup: vi.fn().mockResolvedValue(undefined),
      archiveAccount: vi.fn().mockResolvedValue(undefined),
      archiveAccountGroup: vi.fn().mockResolvedValue(undefined),
      unarchiveAccount: vi.fn().mockResolvedValue(undefined),
      unarchiveAccountGroup: vi.fn().mockResolvedValue(undefined),
      reorderAccountTreeItems: vi.fn().mockResolvedValue(undefined),
    };

    const actions = createActions({ invalidate, state, api });

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

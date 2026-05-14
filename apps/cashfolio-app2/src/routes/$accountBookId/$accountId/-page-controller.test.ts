import { describe, expect, test, vi } from "vitest";
import { AccountType, Unit } from "@/.prisma-client/enums";

vi.mock("@/server/accounts", () => ({
  archiveAccount: vi.fn(),
  deleteAccount: vi.fn(),
  unarchiveAccount: vi.fn(),
  updateAccount: vi.fn(),
}));
vi.mock("@/server/transactions", () => ({
  createSimpleTransaction: vi.fn(),
  createTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  getTransaction: vi.fn(),
  rebookBooking: vi.fn(),
  updateTransaction: vi.fn(),
}));

import {
  createLedgerAccountMutationActions,
  createLedgerMutationActions,
} from "./-page-mutation-actions";

function createActions(args: {
  state: unknown;
  api: unknown;
  invalidate: () => void;
  pendingScrollRef: { current: string | undefined };
}) {
  return createLedgerMutationActions({
    accountBookId: "book-1",
    accountId: "account-1",
    invalidate: args.invalidate,
    state: args.state as Parameters<
      typeof createLedgerMutationActions
    >[0]["state"],
    pendingScrollRef: args.pendingScrollRef,
    api: args.api as Parameters<typeof createLedgerMutationActions>[0]["api"],
  });
}

function createAccountActions(args: {
  state: unknown;
  api: unknown;
  invalidate: () => void;
  onAccountDeleted: () => void | Promise<void>;
}) {
  return createLedgerAccountMutationActions({
    accountBookId: "book-1",
    accountId: "account-1",
    invalidate: args.invalidate,
    onAccountDeleted: args.onAccountDeleted,
    state: args.state as Parameters<
      typeof createLedgerAccountMutationActions
    >[0]["state"],
    api: args.api as Parameters<
      typeof createLedgerAccountMutationActions
    >[0]["api"],
  });
}

describe("createLedgerMutationActions", () => {
  test("creates split transaction, closes modal state, invalidates, and schedules scroll", async () => {
    const invalidate = vi.fn();
    const pendingScrollRef: { current: string | undefined } = {
      current: undefined,
    };

    let editingTransactionId: string | undefined;
    let deletingTransaction: { id: string; description: string } | undefined;
    let rebooking:
      | {
          bookingId: string;
          transactionId: string;
          bookingValue: number;
          bookingUnit: {
            unit: Unit | null;
            currency: string | null;
            cryptocurrency: string | null;
            symbol: string | null;
            tradeCurrency: string | null;
          };
        }
      | undefined;

    const state = {
      getEditingTransactionId: () => editingTransactionId,
      getDeletingTransaction: () => deletingTransaction,
      getRebooking: () => rebooking,
      setModalOpened: vi.fn(),
      setSimpleModalOpened: vi.fn(),
      setEditModalOpened: vi.fn(),
      setCreateSplitInitialValues: vi.fn(),
      setDeletingTransaction: vi.fn((value) => {
        deletingTransaction = value;
      }),
      setRebookModalOpened: vi.fn(),
    };

    const api = {
      createSimpleTransaction: vi.fn().mockResolvedValue({ id: "tx-simple" }),
      createTransaction: vi.fn().mockResolvedValue({ id: "tx-new" }),
      updateTransaction: vi.fn().mockResolvedValue(undefined),
      deleteTransaction: vi.fn().mockResolvedValue(undefined),
      getTransaction: vi.fn(),
      rebookBooking: vi.fn().mockResolvedValue(undefined),
    };

    const actions = createActions({
      invalidate,
      state,
      pendingScrollRef,
      api,
    });

    await actions.handleCreateTransaction({
      description: "Groceries",
      bookings: [
        {
          date: "2026-01-10T00:00:00.000Z",
          accountId: "account-1",
          description: "",
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: undefined,
          symbol: undefined,
          tradeCurrency: undefined,
          value: -20,
        },
        {
          date: "2026-01-10T00:00:00.000Z",
          accountId: "expense-1",
          description: "",
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: undefined,
          symbol: undefined,
          tradeCurrency: undefined,
          value: 20,
        },
      ],
    });

    expect(api.createTransaction).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        description: "Groceries",
        bookings: [
          {
            date: "2026-01-10T00:00:00.000Z",
            accountId: "account-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: undefined,
            symbol: undefined,
            tradeCurrency: undefined,
            value: -20,
          },
          {
            date: "2026-01-10T00:00:00.000Z",
            accountId: "expense-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: undefined,
            symbol: undefined,
            tradeCurrency: undefined,
            value: 20,
          },
        ],
      },
    });
    expect(state.setModalOpened).toHaveBeenCalledWith(false);
    expect(state.setCreateSplitInitialValues).toHaveBeenCalledWith(undefined);
    expect(pendingScrollRef.current).toBe("tx-new");
    expect(invalidate).toHaveBeenCalledOnce();
  });

  test("updates transaction only when an editing transaction id exists", async () => {
    const invalidate = vi.fn();
    const pendingScrollRef: { current: string | undefined } = {
      current: undefined,
    };

    let editingTransactionId: string | undefined = undefined;

    const state = {
      getEditingTransactionId: () => editingTransactionId,
      getDeletingTransaction: () => undefined,
      getRebooking: () => undefined,
      setModalOpened: vi.fn(),
      setSimpleModalOpened: vi.fn(),
      setEditModalOpened: vi.fn(),
      setCreateSplitInitialValues: vi.fn(),
      setDeletingTransaction: vi.fn(),
      setRebookModalOpened: vi.fn(),
    };

    const api = {
      createSimpleTransaction: vi.fn().mockResolvedValue({ id: "tx-simple" }),
      createTransaction: vi.fn().mockResolvedValue({ id: "tx-new" }),
      updateTransaction: vi.fn().mockResolvedValue(undefined),
      deleteTransaction: vi.fn().mockResolvedValue(undefined),
      getTransaction: vi.fn(),
      rebookBooking: vi.fn().mockResolvedValue(undefined),
    };

    const actions = createActions({
      invalidate,
      state,
      pendingScrollRef,
      api,
    });

    await actions.handleUpdateTransaction({
      description: "No-op",
      bookings: [],
    });

    expect(api.updateTransaction).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();

    editingTransactionId = "tx-edit";

    await actions.handleUpdateTransaction({
      description: "Updated",
      bookings: [
        {
          date: "2026-01-11T00:00:00.000Z",
          accountId: "account-1",
          description: "",
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: undefined,
          symbol: undefined,
          tradeCurrency: undefined,
          value: 10,
        },
      ],
    });

    expect(api.updateTransaction).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        transactionId: "tx-edit",
        description: "Updated",
        bookings: [
          {
            date: "2026-01-11T00:00:00.000Z",
            accountId: "account-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: undefined,
            symbol: undefined,
            tradeCurrency: undefined,
            value: 10,
          },
        ],
      },
    });
    expect(state.setEditModalOpened).toHaveBeenCalledWith(false);
    expect(pendingScrollRef.current).toBe("tx-edit");
    expect(invalidate).toHaveBeenCalledOnce();
  });

  test("creates simple transaction and closes simple modal", async () => {
    const invalidate = vi.fn();
    const pendingScrollRef: { current: string | undefined } = {
      current: undefined,
    };

    const state = {
      getEditingTransactionId: () => undefined,
      getDeletingTransaction: () => undefined,
      getRebooking: () => undefined,
      setModalOpened: vi.fn(),
      setSimpleModalOpened: vi.fn(),
      setEditModalOpened: vi.fn(),
      setCreateSplitInitialValues: vi.fn(),
      setDeletingTransaction: vi.fn(),
      setRebookModalOpened: vi.fn(),
    };

    const api = {
      createSimpleTransaction: vi.fn().mockResolvedValue({ id: "tx-simple" }),
      createTransaction: vi.fn().mockResolvedValue({ id: "tx-new" }),
      updateTransaction: vi.fn().mockResolvedValue(undefined),
      deleteTransaction: vi.fn().mockResolvedValue(undefined),
      getTransaction: vi.fn(),
      rebookBooking: vi.fn().mockResolvedValue(undefined),
    };

    const actions = createActions({
      invalidate,
      state,
      pendingScrollRef,
      api,
    });

    await actions.handleCreateSimpleTransaction({
      date: "2026-01-10T00:00:00.000Z",
      description: "Snack",
      counterAccountId: "expense-1",
      amount: 5,
      direction: "CREDIT",
    });

    expect(api.createSimpleTransaction).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        accountId: "account-1",
        date: "2026-01-10T00:00:00.000Z",
        description: "Snack",
        counterAccountId: "expense-1",
        amount: 5,
        direction: "CREDIT",
      },
    });
    expect(state.setSimpleModalOpened).toHaveBeenCalledWith(false);
    expect(pendingScrollRef.current).toBe("tx-simple");
    expect(invalidate).toHaveBeenCalledOnce();
  });

  test("rebooks and deletes with state reset + invalidation", async () => {
    const invalidate = vi.fn();
    const pendingScrollRef: { current: string | undefined } = {
      current: undefined,
    };

    let deletingTransaction: { id: string; description: string } | undefined = {
      id: "tx-delete",
      description: "Old",
    };
    let rebooking:
      | {
          bookingId: string;
          transactionId: string;
          bookingValue: number;
          bookingUnit: {
            unit: Unit | null;
            currency: string | null;
            cryptocurrency: string | null;
            symbol: string | null;
            tradeCurrency: string | null;
          };
        }
      | undefined = {
      bookingId: "booking-1",
      transactionId: "tx-rebook",
      bookingValue: 10,
      bookingUnit: {
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
      },
    };

    const state = {
      getEditingTransactionId: () => undefined,
      getDeletingTransaction: () => deletingTransaction,
      getRebooking: () => rebooking,
      setModalOpened: vi.fn(),
      setSimpleModalOpened: vi.fn(),
      setEditModalOpened: vi.fn(),
      setCreateSplitInitialValues: vi.fn(),
      setDeletingTransaction: vi.fn((value) => {
        deletingTransaction = value;
      }),
      setRebookModalOpened: vi.fn((opened: boolean) => {
        if (!opened) {
          rebooking = undefined;
        }
      }),
    };

    const api = {
      createSimpleTransaction: vi.fn().mockResolvedValue({ id: "tx-simple" }),
      createTransaction: vi.fn().mockResolvedValue({ id: "tx-new" }),
      updateTransaction: vi.fn().mockResolvedValue(undefined),
      deleteTransaction: vi.fn().mockResolvedValue(undefined),
      getTransaction: vi.fn(),
      rebookBooking: vi.fn().mockResolvedValue(undefined),
    };

    const actions = createActions({
      invalidate,
      state,
      pendingScrollRef,
      api,
    });

    await actions.handleRebookBooking({ targetAccountId: "account-2" });

    expect(api.rebookBooking).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        bookingId: "booking-1",
        targetAccountId: "account-2",
      },
    });
    expect(state.setRebookModalOpened).toHaveBeenCalledWith(false);
    expect(pendingScrollRef.current).toBe("tx-rebook");

    await actions.handleDeleteTransaction();

    expect(api.deleteTransaction).toHaveBeenCalledWith({
      data: {
        transactionId: "tx-delete",
        accountBookId: "book-1",
      },
    });
    expect(state.setDeletingTransaction).toHaveBeenCalledWith(undefined);
    expect(deletingTransaction).toBeUndefined();
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});

describe("createLedgerAccountMutationActions", () => {
  test("updates current account, closes modal, and invalidates", async () => {
    const invalidate = vi.fn();
    const onAccountDeleted = vi.fn();
    const state = {
      setAccountEditModalOpened: vi.fn(),
      setDeletingAccount: vi.fn(),
      setArchivingAccount: vi.fn(),
    };
    const api = {
      updateAccount: vi.fn().mockResolvedValue(undefined),
      deleteAccount: vi.fn().mockResolvedValue(undefined),
      archiveAccount: vi.fn().mockResolvedValue(undefined),
      unarchiveAccount: vi.fn().mockResolvedValue(undefined),
    };

    const actions = createAccountActions({
      invalidate,
      onAccountDeleted,
      state,
      api,
    });

    await actions.handleUpdateAccount({
      name: "Checking",
      typeDescriptor: "ASSET",
      type: AccountType.ASSET,
      equityAccountSubtype: undefined,
      groupId: "group-1",
      sortOrder: 3,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: undefined,
      symbol: undefined,
      tradeCurrency: undefined,
      openingBalance: 100,
    });

    expect(api.updateAccount).toHaveBeenCalledWith({
      data: {
        id: "account-1",
        accountBookId: "book-1",
        name: "Checking",
        type: AccountType.ASSET,
        equityAccountSubtype: undefined,
        groupId: "group-1",
        sortOrder: 3,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: undefined,
        symbol: undefined,
        tradeCurrency: undefined,
        openingBalance: 100,
      },
    });
    expect(state.setAccountEditModalOpened).toHaveBeenCalledWith(false);
    expect(invalidate).toHaveBeenCalledOnce();
    expect(onAccountDeleted).not.toHaveBeenCalled();
  });

  test("rejects account update without a name", async () => {
    const invalidate = vi.fn();
    const onAccountDeleted = vi.fn();
    const state = {
      setAccountEditModalOpened: vi.fn(),
      setDeletingAccount: vi.fn(),
      setArchivingAccount: vi.fn(),
    };
    const api = {
      updateAccount: vi.fn().mockResolvedValue(undefined),
      deleteAccount: vi.fn().mockResolvedValue(undefined),
      archiveAccount: vi.fn().mockResolvedValue(undefined),
      unarchiveAccount: vi.fn().mockResolvedValue(undefined),
    };

    const actions = createAccountActions({
      invalidate,
      onAccountDeleted,
      state,
      api,
    });

    await expect(
      actions.handleUpdateAccount({
        name: undefined,
        typeDescriptor: "ASSET",
        type: AccountType.ASSET,
        equityAccountSubtype: undefined,
        groupId: "group-1",
        sortOrder: 3,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: undefined,
        symbol: undefined,
        tradeCurrency: undefined,
        openingBalance: 100,
      }),
    ).rejects.toThrow("Account name is required");

    expect(api.updateAccount).not.toHaveBeenCalled();
    expect(state.setAccountEditModalOpened).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  test("archives, unarchives, and deletes current account", async () => {
    const invalidate = vi.fn();
    const onAccountDeleted = vi.fn().mockResolvedValue(undefined);
    const state = {
      setAccountEditModalOpened: vi.fn(),
      setDeletingAccount: vi.fn(),
      setArchivingAccount: vi.fn(),
    };
    const api = {
      updateAccount: vi.fn().mockResolvedValue(undefined),
      deleteAccount: vi.fn().mockResolvedValue(undefined),
      archiveAccount: vi.fn().mockResolvedValue(undefined),
      unarchiveAccount: vi.fn().mockResolvedValue(undefined),
    };

    const actions = createAccountActions({
      invalidate,
      onAccountDeleted,
      state,
      api,
    });

    await actions.handleArchiveAccount();
    expect(api.archiveAccount).toHaveBeenCalledWith({
      data: { id: "account-1", accountBookId: "book-1" },
    });
    expect(state.setArchivingAccount).toHaveBeenCalledWith(false);

    await actions.handleUnarchiveAccount();
    expect(api.unarchiveAccount).toHaveBeenCalledWith({
      data: { id: "account-1", accountBookId: "book-1" },
    });

    await actions.handleDeleteAccount();
    expect(api.deleteAccount).toHaveBeenCalledWith({
      data: { id: "account-1", accountBookId: "book-1" },
    });
    expect(state.setDeletingAccount).toHaveBeenCalledWith(false);
    expect(onAccountDeleted).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledTimes(3);
  });
});

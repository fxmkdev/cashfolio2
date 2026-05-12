import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType, EquityAccountSubtype } from "../../.prisma-client/enums";

const createServerFn = vi.hoisted(() =>
  vi.fn(() => {
    let validate: ((data: unknown) => unknown) | undefined;
    const chain = {
      inputValidator: vi.fn((validator: (data: unknown) => unknown) => {
        validate = validator;
        return chain;
      }),
      handler: vi.fn((handler: ({ data }: { data: unknown }) => unknown) => {
        return async ({ data }: { data: unknown }) => {
          const validatedData = validate ? validate(data) : data;
          return handler({ data: validatedData });
        };
      }),
    };
    return chain;
  }),
);

const ensureAuthorizedForAccountBookId = vi.hoisted(() => vi.fn());
const ensureSameOriginRequestFromServerContext = vi.hoisted(() => vi.fn());
const validateAccountInput = vi.hoisted(() => vi.fn());
const validateAccountGroupInput = vi.hoisted(() => vi.fn());

const prisma = vi.hoisted(() => ({
  account: {
    findMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  accountGroup: {
    findMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  booking: {
    count: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("../../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId,
}));

vi.mock("../../security/same-origin.server", () => ({
  ensureSameOriginRequestFromServerContext,
}));

vi.mock("../../shared/account-validation", () => ({
  validateAccountInput,
  validateAccountGroupInput,
}));

vi.mock("../../prisma.server", () => ({
  prisma,
}));

import {
  archiveAccount,
  archiveAccountGroup,
  createAccount,
  createAccountGroup,
  deleteAccount,
  deleteAccountGroup,
  unarchiveAccount,
  unarchiveAccountGroup,
  updateAccount,
  updateAccountGroup,
} from "./accounts-mutations";

describe("accounts-mutations system-managed subtype guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.account.findMany.mockResolvedValue([]);
    prisma.accountGroup.findMany.mockResolvedValue([]);
    prisma.booking.count.mockResolvedValue(0);
    prisma.account.count.mockResolvedValue(0);
    prisma.accountGroup.count.mockResolvedValue(0);
  });

  it("rejects creating gain/loss accounts", async () => {
    await expect(
      createAccount({
        data: {
          accountBookId: "book-1",
          name: "Manual Gain/Loss",
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        },
      }),
    ).rejects.toThrow("Gain/Loss accounts are system-managed.");
  });

  it("rejects creating opening balances accounts", async () => {
    await expect(
      createAccount({
        data: {
          accountBookId: "book-1",
          name: "Opening Balances",
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
        },
      }),
    ).rejects.toThrow("Opening Balances accounts are system-managed.");
  });

  it("rejects updating gain/loss accounts", async () => {
    prisma.account.findUniqueOrThrow.mockResolvedValueOnce({
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
    });

    await expect(
      updateAccount({
        data: {
          id: "account-1",
          accountBookId: "book-1",
          name: "Gain/Loss",
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        },
      }),
    ).rejects.toThrow("Gain/Loss accounts are system-managed.");
    expect(prisma.account.findMany).not.toHaveBeenCalled();
    expect(validateAccountInput).not.toHaveBeenCalled();
  });

  it("rejects updating opening balances accounts", async () => {
    prisma.account.findUniqueOrThrow.mockResolvedValueOnce({
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
    });

    await expect(
      updateAccount({
        data: {
          id: "account-1",
          accountBookId: "book-1",
          name: "Opening Balances",
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
        },
      }),
    ).rejects.toThrow("Opening Balances accounts are system-managed.");
    expect(prisma.account.findMany).not.toHaveBeenCalled();
    expect(validateAccountInput).not.toHaveBeenCalled();
  });

  it("rejects deleting and archiving gain/loss accounts", async () => {
    prisma.account.findUniqueOrThrow.mockResolvedValue({
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
      isActive: true,
      groupId: null,
    });

    await expect(
      deleteAccount({ data: { id: "account-1", accountBookId: "book-1" } }),
    ).rejects.toThrow("Gain/Loss accounts are system-managed.");

    await expect(
      archiveAccount({ data: { id: "account-1", accountBookId: "book-1" } }),
    ).rejects.toThrow("Gain/Loss accounts are system-managed.");

    await expect(
      unarchiveAccount({
        data: { id: "account-1", accountBookId: "book-1" },
      }),
    ).rejects.toThrow("Gain/Loss accounts are system-managed.");
  });

  it("rejects deleting and archiving opening balances accounts", async () => {
    prisma.account.findUniqueOrThrow.mockResolvedValue({
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
      isActive: true,
      groupId: null,
    });

    await expect(
      deleteAccount({ data: { id: "account-1", accountBookId: "book-1" } }),
    ).rejects.toThrow("Opening Balances accounts are system-managed.");

    await expect(
      archiveAccount({ data: { id: "account-1", accountBookId: "book-1" } }),
    ).rejects.toThrow("Opening Balances accounts are system-managed.");

    await expect(
      unarchiveAccount({
        data: { id: "account-1", accountBookId: "book-1" },
      }),
    ).rejects.toThrow("Opening Balances accounts are system-managed.");
  });

  it("rejects creating gain/loss groups", async () => {
    await expect(
      createAccountGroup({
        data: {
          accountBookId: "book-1",
          name: "Manual Gain/Loss Group",
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        },
      }),
    ).rejects.toThrow("Gain/Loss groups are system-managed.");
  });

  it("rejects creating opening balances groups", async () => {
    await expect(
      createAccountGroup({
        data: {
          accountBookId: "book-1",
          name: "Opening Balances Group",
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
        },
      }),
    ).rejects.toThrow("Opening Balances groups are system-managed.");
  });

  it("rejects system-managed subtype even when type is not equity", async () => {
    await expect(
      createAccount({
        data: {
          accountBookId: "book-1",
          name: "Invalid subtype account",
          type: AccountType.ASSET,
          equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        },
      }),
    ).rejects.toThrow("Gain/Loss accounts are system-managed.");

    await expect(
      createAccountGroup({
        data: {
          accountBookId: "book-1",
          name: "Invalid subtype group",
          type: AccountType.LIABILITY,
          equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
        },
      }),
    ).rejects.toThrow("Opening Balances groups are system-managed.");
  });

  it("rejects updating gain/loss groups", async () => {
    prisma.accountGroup.findUniqueOrThrow.mockResolvedValueOnce({
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
    });

    await expect(
      updateAccountGroup({
        data: {
          id: "group-1",
          accountBookId: "book-1",
          name: "Gain/Loss",
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        },
      }),
    ).rejects.toThrow("Gain/Loss groups are system-managed.");
    expect(prisma.accountGroup.findMany).not.toHaveBeenCalled();
    expect(validateAccountGroupInput).not.toHaveBeenCalled();
  });

  it("rejects updating opening balances groups", async () => {
    prisma.accountGroup.findUniqueOrThrow.mockResolvedValueOnce({
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
    });

    await expect(
      updateAccountGroup({
        data: {
          id: "group-1",
          accountBookId: "book-1",
          name: "Opening Balances",
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
        },
      }),
    ).rejects.toThrow("Opening Balances groups are system-managed.");
    expect(prisma.accountGroup.findMany).not.toHaveBeenCalled();
    expect(validateAccountGroupInput).not.toHaveBeenCalled();
  });

  it("rejects deleting and archiving gain/loss groups", async () => {
    prisma.accountGroup.findUniqueOrThrow.mockResolvedValue({
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
      isActive: true,
      parentGroupId: null,
    });

    await expect(
      deleteAccountGroup({ data: { id: "group-1", accountBookId: "book-1" } }),
    ).rejects.toThrow("Gain/Loss groups are system-managed.");

    await expect(
      archiveAccountGroup({
        data: { id: "group-1", accountBookId: "book-1" },
      }),
    ).rejects.toThrow("Gain/Loss groups are system-managed.");

    await expect(
      unarchiveAccountGroup({
        data: { id: "group-1", accountBookId: "book-1" },
      }),
    ).rejects.toThrow("Gain/Loss groups are system-managed.");
  });

  it("rejects deleting and archiving opening balances groups", async () => {
    prisma.accountGroup.findUniqueOrThrow.mockResolvedValue({
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
      isActive: true,
      parentGroupId: null,
    });

    await expect(
      deleteAccountGroup({ data: { id: "group-1", accountBookId: "book-1" } }),
    ).rejects.toThrow("Opening Balances groups are system-managed.");

    await expect(
      archiveAccountGroup({
        data: { id: "group-1", accountBookId: "book-1" },
      }),
    ).rejects.toThrow("Opening Balances groups are system-managed.");

    await expect(
      unarchiveAccountGroup({
        data: { id: "group-1", accountBookId: "book-1" },
      }),
    ).rejects.toThrow("Opening Balances groups are system-managed.");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType, Unit } from "../.prisma-client/enums";

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
const getCurrencyExchangeRate = vi.hoisted(() => vi.fn());
const getCryptocurrencyToCurrencyExchangeRate = vi.hoisted(() => vi.fn());
const getSecurityToCurrencyExchangeRate = vi.hoisted(() => vi.fn());

const prisma = vi.hoisted(() => ({
  account: {
    findMany: vi.fn(),
    groupBy: vi.fn(),
  },
  accountGroup: {
    findMany: vi.fn(),
    groupBy: vi.fn(),
  },
  booking: {
    groupBy: vi.fn(),
  },
  accountBook: {
    findUniqueOrThrow: vi.fn(),
  },
}));

vi.mock("../prisma.server", () => ({
  prisma,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId,
}));

vi.mock("./valuation.server", () => ({
  getCurrencyExchangeRate,
  getCryptocurrencyToCurrencyExchangeRate,
  getSecurityToCurrencyExchangeRate,
}));

import { getAccountsPageData, getAccountTreeData } from "./accounts-queries";

describe("getAccountTreeData", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.account.findMany.mockResolvedValue([]);
    prisma.account.groupBy.mockResolvedValue([]);
    prisma.accountGroup.findMany.mockResolvedValue([]);
    prisma.accountGroup.groupBy.mockResolvedValue([]);
    prisma.booking.groupBy.mockResolvedValue([]);
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-08T00:00:00.000Z"),
    });

    getCurrencyExchangeRate.mockResolvedValue(1);
    getCryptocurrencyToCurrencyExchangeRate.mockResolvedValue(null);
    getSecurityToCurrencyExchangeRate.mockResolvedValue(null);
  });

  it("returns null reference balances and unavailable actions when those features are disabled", async () => {
    prisma.account.findMany.mockResolvedValue([
      {
        id: "asset-1",
        name: "Asset One",
        type: AccountType.ASSET,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        groupId: "group-1",
        isActive: true,
        sortOrder: 1,
      },
      {
        id: "liability-1",
        name: "Liability One",
        type: AccountType.LIABILITY,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        groupId: null,
        isActive: true,
        sortOrder: 2,
      },
    ]);
    prisma.accountGroup.findMany.mockResolvedValue([
      {
        id: "group-1",
        name: "Assets",
        type: AccountType.ASSET,
        equityAccountSubtype: null,
        parentGroupId: null,
        isActive: true,
        sortOrder: 0,
      },
    ]);
    prisma.booking.groupBy
      .mockResolvedValueOnce([
        { accountId: "asset-1", _sum: { value: 10 } },
        { accountId: "liability-1", _sum: { value: 5 } },
      ])
      .mockResolvedValueOnce([
        { accountId: "asset-1", _sum: { value: 8 } },
        { accountId: "liability-1", _sum: { value: 2 } },
      ]);

    const result = await getAccountTreeData({
      data: {
        accountBookId: "book-1",
        accountState: "active",
        includeReferenceBalances: false,
        includeActionAvailability: false,
      },
    });

    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-1");
    expect(getCurrencyExchangeRate).not.toHaveBeenCalled();

    const assetRow = result.rows.find((row) => row.id === "asset-1");
    const liabilityRow = result.rows.find((row) => row.id === "liability-1");
    const groupRow = result.rows.find((row) => row.id === "group-1");

    expect(assetRow).toMatchObject({
      balance: 10,
      balanceInReferenceCurrency: null,
      openingBalance: 8,
      deletable: false,
      deleteDisabledReason: "Action availability not requested",
      archivable: false,
      archiveDisabledReason: "Action availability not requested",
      unarchivable: false,
      unarchiveDisabledReason: "Action availability not requested",
    });
    expect(liabilityRow).toMatchObject({
      balance: -5,
      balanceInReferenceCurrency: null,
      openingBalance: -2,
    });
    expect(groupRow).toMatchObject({
      nodeType: "accountGroup",
      deletable: false,
      archivable: false,
      unarchivable: false,
    });
  });

  it("builds inactive hierarchy rows with action-availability constraints", async () => {
    prisma.account.findMany.mockResolvedValue([
      {
        id: "asset-archived",
        name: "Archived Asset",
        type: AccountType.ASSET,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        groupId: "group-child",
        isActive: false,
        sortOrder: 1,
      },
    ]);
    prisma.accountGroup.findMany.mockResolvedValue([
      {
        id: "group-root",
        name: "Root",
        type: AccountType.ASSET,
        equityAccountSubtype: null,
        parentGroupId: null,
        isActive: true,
        sortOrder: 0,
      },
      {
        id: "group-child",
        name: "Child",
        type: AccountType.ASSET,
        equityAccountSubtype: null,
        parentGroupId: "group-root",
        isActive: false,
        sortOrder: 1,
      },
    ]);
    prisma.booking.groupBy
      .mockResolvedValueOnce([{ accountId: "asset-archived", _count: 1 }])
      .mockResolvedValueOnce([
        { accountId: "asset-archived", _sum: { value: 5 } },
      ])
      .mockResolvedValueOnce([
        { accountId: "asset-archived", _sum: { value: 2 } },
      ]);
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-08T00:00:00.000Z"),
    });
    prisma.account.groupBy
      .mockResolvedValueOnce([{ groupId: "group-child", _count: 1 }])
      .mockResolvedValueOnce([]);
    prisma.accountGroup.groupBy
      .mockResolvedValueOnce([{ parentGroupId: "group-root", _count: 1 }])
      .mockResolvedValueOnce([]);

    const result = await getAccountTreeData({
      data: {
        accountBookId: "book-2",
        accountState: "inactive",
      },
    });

    const accountRow = result.rows.find((row) => row.id === "asset-archived");
    const rootGroupRow = result.rows.find((row) => row.id === "group-root");
    const childGroupRow = result.rows.find((row) => row.id === "group-child");

    expect(accountRow).toMatchObject({
      isActive: false,
      balance: 5,
      openingBalance: 2,
      deletable: false,
      deleteDisabledReason: "Cannot delete account because it has bookings",
      archivable: false,
      archiveDisabledReason: "Account is already archived",
      unarchivable: false,
      unarchiveDisabledReason:
        "Cannot unarchive account because its parent group is archived",
    });
    expect(rootGroupRow).toMatchObject({
      isActive: true,
      deletable: false,
      deleteDisabledReason:
        "Cannot delete group because it contains sub-groups",
    });
    expect(childGroupRow).toMatchObject({
      isActive: false,
      archivable: false,
      archiveDisabledReason: "Group is already archived",
      unarchivable: true,
      unarchiveDisabledReason: undefined,
    });

    expect(result.rows.map((row) => row.id)).toEqual(
      expect.arrayContaining(["group-root", "group-child", "asset-archived"]),
    );
  });
});

describe("getAccountsPageData", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.account.findMany.mockResolvedValue([]);
    prisma.account.groupBy.mockResolvedValue([]);
    prisma.accountGroup.findMany.mockResolvedValue([]);
    prisma.accountGroup.groupBy.mockResolvedValue([]);
    prisma.booking.groupBy.mockResolvedValue([]);
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-08T00:00:00.000Z"),
    });

    getCurrencyExchangeRate.mockResolvedValue(1);
    getCryptocurrencyToCurrencyExchangeRate.mockResolvedValue(null);
    getSecurityToCurrencyExchangeRate.mockResolvedValue(null);
  });

  it("authorizes once and skips active-only page helpers for inactive state", async () => {
    const result = await getAccountsPageData({
      data: {
        accountBookId: "book-3",
        accountState: "inactive",
      },
    });

    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledTimes(1);
    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-3");
    expect(prisma.account.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.accountGroup.findMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      accountGroups: [],
      existingNodes: [],
      referenceCurrency: "CHF",
      rows: [],
    });
  });
});

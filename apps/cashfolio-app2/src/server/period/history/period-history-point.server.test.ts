import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AccountType, Unit } from "../../../.prisma-client/enums";

const prisma = vi.hoisted(() => ({
  accountBook: {
    findUniqueOrThrow: vi.fn(),
  },
  accountGroup: { findMany: vi.fn() },
  account: {
    findMany: vi.fn(),
  },
}));

const getOrLoadPeriodHistoryPointMetrics = vi.hoisted(() => vi.fn());

vi.mock("../../../prisma.server", () => ({
  prisma,
}));

vi.mock("../cache/period-history-metrics-cache", () => ({
  getOrLoadPeriodHistoryPointMetrics,
}));

import {
  loadPeriodHistoryPoint,
  loadPeriodHistoryPointContext,
  type PeriodHistoryPointContext,
} from "./period-history-point.server";

function createContext(args: {
  startDate: string;
  holdingAccountsResolved?: PeriodHistoryPointContext["holdingAccountsResolved"];
  hasCashAccounts?: boolean;
}): PeriodHistoryPointContext {
  return {
    netWorthScopes: [],
    revision: "revision",
    referenceCurrency: "CHF",
    accountBookStartDate: new Date(args.startDate),
    holdingAccountsResolved: args.holdingAccountsResolved ?? [],
    hasCashAccounts: args.hasCashAccounts ?? false,
  };
}

describe("loadPeriodHistoryPointContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "chf",
      startDate: new Date("2026-02-12T18:45:00.000Z"),
    });
    prisma.accountGroup.findMany.mockResolvedValue([]);
    prisma.account.findMany.mockResolvedValue([
      {
        id: "holding-security",
        name: "holding-security",
        groupId: null,
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "AAPL",
        tradeCurrency: "USD",
        isCashAccount: false,
      },
      {
        id: "cash-reference",
        name: "cash-reference",
        groupId: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        isCashAccount: true,
      },
      {
        id: "liability-foreign",
        name: "liability-foreign",
        groupId: null,
        unit: Unit.CURRENCY,
        currency: "USD",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        isCashAccount: false,
      },
    ]);
  });

  test("builds normalized context and filters to convertible holding accounts", async () => {
    const result = await loadPeriodHistoryPointContext({
      accountBookId: "book-ctx",
    });

    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "book-ctx" },
      select: {
        periodCacheRevision: true,
        classificationSchemes: {
          where: { id: "assetClass" },
          select: {
            nodes: {
              select: { id: true, name: true, parentId: true, sortOrder: true },
            },
          },
        },

        referenceCurrency: true,
        startDate: true,
      },
    });
    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: {
        accountBookId: "book-ctx",
        type: {
          in: [AccountType.BALANCE],
        },
      },
      select: {
        id: true,
        name: true,
        groupId: true,
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
        isCashAccount: true,
      },
    });
    expect(result.referenceCurrency).toBe("CHF");
    expect(result.accountBookStartDate.toISOString()).toBe(
      "2026-02-12T00:00:00.000Z",
    );
    expect(result.holdingAccountsResolved.map((account) => account.id)).toEqual(
      ["holding-security", "liability-foreign"],
    );
    expect(result.hasCashAccounts).toBe(true);
  });

  test("loads the full Balance Account hierarchy once without filtering activity or balances", async () => {
    prisma.account.findMany.mockResolvedValue([
      {
        id: "zero",
        name: "Bank",
        groupId: "nested",
        unit: Unit.CURRENCY,
        currency: "CHF",
        isActive: true,
      },
      {
        id: "archived",
        name: "Bank",
        groupId: "other",
        unit: Unit.CURRENCY,
        currency: "CHF",
        isActive: false,
      },
      {
        id: "ungrouped",
        name: "Wallet",
        groupId: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
      },
    ]);
    prisma.accountGroup.findMany.mockResolvedValue([
      { id: "parent", name: "Banking", parentGroupId: null },
      { id: "nested", name: "Cash", parentGroupId: "parent" },
      { id: "other", name: "Other", parentGroupId: null },
      { id: "empty", name: "Empty", parentGroupId: null },
    ]);
    const result = await loadPeriodHistoryPointContext({
      accountBookId: "book-ctx",
    });
    expect(prisma.account.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.accountGroup.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.accountGroup.findMany).toHaveBeenCalledWith({
      where: { accountBookId: "book-ctx", type: AccountType.BALANCE },
      select: { id: true, name: true, parentGroupId: true },
    });
    expect(result.netWorthScopes).toEqual(
      expect.arrayContaining([
        {
          value: "group:empty",
          label: "Empty",
          treeLabel: "Empty",
          kind: "group",
        },
        {
          value: "group:nested",
          label: "Banking / Cash",
          treeLabel: "Cash",
          kind: "group",
          parentValue: "group:parent",
        },
        {
          value: "account:zero",
          label: "Banking / Cash / Bank",
          treeLabel: "Bank",
          kind: "account",
          parentValue: "group:nested",
        },
        {
          value: "account:archived",
          label: "Other / Bank",
          treeLabel: "Bank",
          kind: "account",
          parentValue: "group:other",
        },
        {
          value: "account:ungrouped",
          label: "Wallet",
          treeLabel: "Wallet",
          kind: "account",
        },
      ]),
    );
  });
});

describe("loadPeriodHistoryPoint", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));

    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      classificationSchemes: [],
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.accountGroup.findMany.mockResolvedValue([]);
    prisma.account.findMany.mockResolvedValue([]);

    getOrLoadPeriodHistoryPointMetrics.mockResolvedValue({
      totalReturn: 42,
      savings: 10,
      cashFlow: 8,
      income: 50,
      expenses: 40,
      gainsLosses: 32,
      assets: 140,
      liabilities: 60,
      netWorth: 80,
      scopeOptions: {
        cashFlow: [],
        income: [],
        expenses: [],
        gainsLosses: [],
        netWorth: [],
      },
      scopedMetricValue: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("zeros total return for periods before account-book start", async () => {
    vi.setSystemTime(new Date("2026-01-10T12:00:00.000Z"));

    const result = await loadPeriodHistoryPoint({
      accountBookId: "book-1",
      period: "2026-01",
      context: createContext({
        startDate: "2026-01-20T00:00:00.000Z",
      }),
    });

    expect(result).toMatchObject({
      selectedPeriodValue: "2026-01",
      selectedPeriodEnd: new Date("2026-01-09T00:00:00.000Z"),
      totalReturn: 0,
      savings: 0,
      cashFlow: 0,
      income: 0,
      expenses: 0,
      gainsLosses: 0,
      assets: 0,
      liabilities: 0,
      netWorth: 0,
      scopeOptions: {
        cashFlow: [],
        income: [],
        expenses: [],
        gainsLosses: [],
        netWorth: [],
      },
      scopedMetricValue: undefined,
    });
    expect(getOrLoadPeriodHistoryPointMetrics).not.toHaveBeenCalled();
  });

  test("returns scoped metric value zero before account-book start when scope filter is requested", async () => {
    vi.setSystemTime(new Date("2026-01-10T12:00:00.000Z"));

    const result = await loadPeriodHistoryPoint({
      accountBookId: "book-1",
      period: "2026-01",
      context: createContext({
        startDate: "2026-01-20T00:00:00.000Z",
      }),
      metricScopeFilter: {
        metric: "income",
        scope: "total",
      },
    });

    expect(result.scopedMetricValue).toBe(0);
  });

  test("loads history metrics through the cache layer", async () => {
    const result = await loadPeriodHistoryPoint({
      accountBookId: "book-1",
      period: "2026-02",
      context: createContext({
        startDate: "2026-01-01T00:00:00.000Z",
      }),
    });

    expect(getOrLoadPeriodHistoryPointMetrics).toHaveBeenCalledWith({
      accountBookId: "book-1",
      period: "2026-02",
      metricScopeFilter: undefined,
      valuationContext: undefined,
    });

    expect(result).toEqual({
      selectedPeriodValue: "2026-02",
      selectedPeriodLabel: "February 2026",
      selectedPeriodEnd: new Date("2026-02-28T00:00:00.000Z"),
      totalReturn: 42,
      savings: 10,
      cashFlow: 8,
      income: 50,
      expenses: 40,
      gainsLosses: 32,
      assets: 140,
      liabilities: 60,
      netWorth: 80,
      scopeOptions: {
        cashFlow: [],
        income: [],
        expenses: [],
        gainsLosses: [],
        netWorth: [],
      },
      scopedMetricValue: 0,
    });
  });

  test("loads context when it is not provided", async () => {
    await loadPeriodHistoryPoint({
      accountBookId: "book-context",
      period: "2026-02",
    });

    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "book-context" },
      select: {
        periodCacheRevision: true,
        classificationSchemes: {
          where: { id: "assetClass" },
          select: {
            nodes: {
              select: { id: true, name: true, parentId: true, sortOrder: true },
            },
          },
        },

        referenceCurrency: true,
        startDate: true,
      },
    });
    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: {
        accountBookId: "book-context",
        type: {
          in: [AccountType.BALANCE],
        },
      },
      select: {
        id: true,
        name: true,
        groupId: true,
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
        isCashAccount: true,
      },
    });
  });
});

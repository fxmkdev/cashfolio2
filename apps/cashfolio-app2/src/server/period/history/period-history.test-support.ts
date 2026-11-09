import { vi } from "vitest";

const revisionQuery = vi.hoisted(() => vi.fn());

vi.mock("../../../prisma.server", () => ({
  prisma: { accountBook: { findUniqueOrThrow: revisionQuery } },
}));

const createServerFn = vi.hoisted(() =>
  vi.fn(() => {
    let validate: ((data: unknown) => unknown) | undefined;
    const chain = {
      validator: vi.fn((validator: (data: unknown) => unknown) => {
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

const loadPeriodHistoryPoint = vi.hoisted(() => vi.fn());

const loadPeriodHistoryPointContext = vi.hoisted(() => vi.fn());

const loadHistoryOpeningBalancePoint = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("../../../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId,
}));

vi.mock("./period-history-point.server", () => ({
  loadPeriodHistoryPoint,
  loadPeriodHistoryPointContext,
}));

vi.mock("./period-history-opening-balance.server", () => ({
  loadHistoryOpeningBalancePoint,
}));
const resetHistory = () => {
  vi.clearAllMocks();
  revisionQuery.mockResolvedValue({ periodCacheRevision: "revision" });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-18T12:00:00.000Z"));

  loadPeriodHistoryPointContext.mockResolvedValue({
    revision: "revision",
    referenceCurrency: "CHF",
    accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
    holdingAccountsResolved: [],
    netWorthScopes: [],
    hasCashAccounts: true,
  });
  loadHistoryOpeningBalancePoint.mockResolvedValue({
    date: "2026-01-04T00:00:00.000Z",
    label: "Opening Balance",
    assets: 150,
    liabilities: 40,
    netWorth: 110,
  });

  loadPeriodHistoryPoint.mockImplementation(
    async ({ period }: { period: string; accountBookId: string }) => ({
      selectedPeriodValue: period,
      selectedPeriodLabel: `Label ${period}`,
      selectedPeriodEnd:
        period === "2026-03"
          ? new Date("2026-03-17T00:00:00.000Z")
          : period === "2026-02"
            ? new Date("2026-02-28T00:00:00.000Z")
            : new Date("2026-01-31T00:00:00.000Z"),
      totalReturn: period.length,
      savings: period.length + 1,
      cashFlow: period.length + 8,
      income: period.length + 2,
      expenses: period.length + 3,
      gainsLosses: period.length + 4,
      assets: period.length + 5,
      liabilities: period.length + 6,
      netWorth: period.length + 7,
      scopeOptions: {
        cashFlow: [
          {
            value: "account:cash-a",
            label: "Cash A",
            kind: "account",
          },
        ],
        income: [
          {
            value: "account:income-a",
            label: "Income A",
            kind: "account",
          },
        ],
        expenses: [
          {
            value: "group:expense-g",
            label: "Expense G",
            kind: "group",
          },
        ],
        gainsLosses: [
          {
            value: "asset-class:CASH_AND_CASH_EQUIVALENTS",
            label: "Cash & Cash Equivalents",
            kind: "gainLoss",
          },
        ],
        netWorth: [
          {
            value: "group:asset-g",
            label: "Asset G",
            kind: "group",
          },
          {
            value: "account:liability-a",
            label: "Liability A",
            kind: "account",
          },
        ],
      },
      scopedMetricValue: period.length + 20,
    }),
  );
};
const cleanupHistory = () => {
  vi.useRealTimers();
};
export {
  buildHistoryPeriodValues,
  cleanupHistory,
  ensureAuthorizedForAccountBookId,
  getPeriodHistory,
  loadHistoryOpeningBalancePoint,
  loadPeriodHistoryPoint,
  loadPeriodHistoryPointContext,
  resetHistory,
  revisionQuery,
  withResourceRequest,
};

// Register mocks before importing the tested modules and their dependencies.
const { buildHistoryPeriodValues, getPeriodHistory } =
  await import("./period-history");
const { withResourceRequest } = await import("../../resource-context.server");

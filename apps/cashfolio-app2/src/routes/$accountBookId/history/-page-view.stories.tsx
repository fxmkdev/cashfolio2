import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";
import { HistoryPageView } from "./-page-view";
import type { PeriodHistoryResponse } from "@/server/period-history";
import { netWorthScopeOptions } from "./-story-fixtures";

const history: PeriodHistoryResponse = {
  referenceCurrency: "CHF",
  hasCashAccounts: true,
  openingBalancePoint: {
    date: "2025-12-31T00:00:00Z",
    label: "Opening Balance",
    assets: 1500,
    liabilities: 300,
    netWorth: 100,
  },
  points: [500, 0, -200, -100, 300].map((netWorth, index) => ({
    periodValue: `2026-0${index + 1}`,
    periodLabel: `Month ${index + 1}`,
    periodEndDate: new Date(Date.UTC(2026, index + 1, 0)).toISOString(),
    totalReturn: 0,
    savings: 0,
    cashFlow: 0,
    income: 0,
    expenses: 0,
    gainsLosses: 0,
    assets: 1500,
    liabilities: 300,
    netWorth,
  })),
  scopeOptions: {
    cashFlow: [],
    income: [],
    expenses: [],
    gainsLosses: [],
    netWorth: netWorthScopeOptions,
  },
  scopeSelection: {
    cashFlow: "total",
    income: "total",
    expenses: "total",
    gainsLosses: "total",
    netWorth: "account:checking",
  },
};

const meta = {
  title: "Routes/HistoryPageView",
  component: HistoryPageView,
  args: {
    accountBookId: "storybook-book",
    selectedMode: "month",
    selectedMetric: "netWorth",
    isViewPending: false,
    history,
    onAccountPeriodDoubleClick: fn(),
    onModeChange: fn(),
    onViewChange: fn(),
  },
} satisfies Meta<typeof HistoryPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedAccountHistory: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Checking by Period")).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "View" })).toHaveValue(
      "Checking",
    );
    await expect(
      canvas.getByText("Double-click a period to open ledger."),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("list", { name: "Legend" }),
    ).not.toBeInTheDocument();
  },
};

export const ManagedPortfolioHistory: Story = {
  args: {
    selectedMetric: "gainsLosses",
    history: {
      ...history,
      points: history.points.map((point, index) => ({
        ...point,
        gainsLosses: [50, -20, 30, 10, 40][index]!,
      })),
      scopeSelection: {
        ...history.scopeSelection,
        gainsLosses: "gain-loss-investment:EQUITIES:managed-portfolios",
      },
      scopeOptions: {
        ...history.scopeOptions,
        gainsLosses: [
          {
            value: "asset-class:EQUITIES",
            label: "Equities",
            treeLabel: "Equities",
            kind: "gainLoss",
          },
          {
            value: "gain-loss-investment:EQUITIES:managed-portfolios",
            label: "Equities / Managed Portfolios",
            treeLabel: "Managed Portfolios",
            kind: "gainLoss",
            parentValue: "asset-class:EQUITIES",
          },
          {
            value: "gain-loss-account:portfolio",
            label: "Equities / Managed Portfolios / Portfolio",
            treeLabel: "Portfolio",
            kind: "gainLoss",
            parentValue: "gain-loss-investment:EQUITIES:managed-portfolios",
            accountId: "portfolio",
          },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("textbox", { name: "View" })).toHaveValue(
      "Managed Portfolios",
    );
    await expect(
      canvas.queryByText("Double-click a period to open ledger."),
    ).not.toBeInTheDocument();
  },
};

const creditCardHistory: PeriodHistoryResponse = {
  ...history,
  openingBalancePoint: { ...history.openingBalancePoint, netWorth: 0 },
  points: [0, -110, 0, -110, 0, -220].map((netWorth, index) => ({
    ...history.points[0],
    periodValue: `2026-0${index + 1}`,
    periodLabel: `Month ${index + 1}`,
    periodEndDate: new Date(Date.UTC(2026, index + 1, 0)).toISOString(),
    netWorth,
  })),
  scopeOptions: {
    ...history.scopeOptions,
    netWorth: history.scopeOptions.netWorth.map((option) =>
      option.value === "account:card"
        ? {
            ...option,
            label: "Banking / Credit Card CHF",
            treeLabel: "Credit Card CHF",
          }
        : option,
    ),
  },
  scopeSelection: { ...history.scopeSelection, netWorth: "account:card" },
};

export const CreditCardLight: Story = {
  args: { history: creditCardHistory },
  parameters: { colorScheme: "light" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Credit Card CHF by Period"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("figure", { name: "chart, 1 series" }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("list", { name: "Legend" }),
    ).not.toBeInTheDocument();
  },
};

export const CreditCardDark: Story = {
  ...CreditCardLight,
  parameters: { colorScheme: "dark" },
};

export const BalanceGroupLight: Story = {
  args: {
    history: {
      ...history,
      scopeSelection: { ...history.scopeSelection, netWorth: "group:banking" },
    },
  },
  parameters: { colorScheme: "light" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Banking by Period")).toBeInTheDocument();
    await expect(
      canvas.queryByText("Double-click a period to open ledger."),
    ).not.toBeInTheDocument();
  },
};

export const BalanceGroupDark: Story = {
  ...BalanceGroupLight,
  parameters: { colorScheme: "dark" },
};

export const NetWorthTotalLight: Story = {
  args: {
    history: {
      ...history,
      scopeSelection: { ...history.scopeSelection, netWorth: "total" },
    },
  },
  parameters: { colorScheme: "light" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Net Worth by Period")).toBeInTheDocument();
    await expect(
      canvas.queryByText("Double-click a period to open ledger."),
    ).not.toBeInTheDocument();
  },
};

export const NetWorthTotalDark: Story = {
  ...NetWorthTotalLight,
  parameters: { colorScheme: "dark" },
};

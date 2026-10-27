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
  },
};

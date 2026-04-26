import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Text } from "@mantine/core";
import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import {
  formatMonthPeriodValue,
  PERIOD_MONTH_NAMES,
  parseExplicitMonthPeriod,
  parseExplicitYearPeriod,
} from "@/shared/period";
import {
  DEFAULT_PERIOD_VALUE,
  PERIOD_PRESET_LAST_MONTH,
  PERIOD_PRESET_LAST_YEAR,
  PERIOD_PRESET_MTD,
  PERIOD_PRESET_YTD,
} from "./-page-types";
import { PeriodPageView, type PeriodPageViewProps } from "./-page-view";

const STORYBOOK_ACCOUNT_BOOK_ID = "storybook-book";

function clearPeriodStorySessionStorage(accountBookId: string) {
  if (typeof window === "undefined") {
    return;
  }

  const storageKeys = [
    `cashfolio:periodPageState:${accountBookId}`,
    `cashfolio:periodExpandedGroups:${accountBookId}:breakdown:expense`,
    `cashfolio:periodExpandedGroups:${accountBookId}:breakdown:income`,
    `cashfolio:periodExpandedGroups:${accountBookId}:allocation:asset`,
    `cashfolio:periodExpandedGroups:${accountBookId}:allocation:liability`,
    `cashfolio:periodExpandedGroups:${accountBookId}:gains-losses`,
  ];

  for (const storageKey of storageKeys) {
    window.sessionStorage.removeItem(storageKey);
  }
}

function deriveOverviewFromSelectedPeriodValue(
  selectedPeriodValue: string,
): PeriodPageViewProps["overview"] {
  const maxDate = new Date(baseOverview.maxDate);
  const currentYear = maxDate.getUTCFullYear();
  const currentMonth = maxDate.getUTCMonth();
  const lastMonthDate = new Date(Date.UTC(currentYear, currentMonth - 1, 1));

  const explicitMonth = parseExplicitMonthPeriod(selectedPeriodValue);
  if (explicitMonth) {
    return {
      ...baseOverview,
      selectedPeriodValue: explicitMonth.value,
      selectedPeriodSpecifier: "month",
      selectedPeriodLabel: `${PERIOD_MONTH_NAMES[explicitMonth.month]} ${explicitMonth.year}`,
      selectedGranularity: "month",
      selectedYear: explicitMonth.year,
      selectedMonth: explicitMonth.month,
    };
  }

  const explicitYear = parseExplicitYearPeriod(selectedPeriodValue);
  if (explicitYear) {
    return {
      ...baseOverview,
      selectedPeriodValue: explicitYear.value,
      selectedPeriodSpecifier: "year",
      selectedPeriodLabel: explicitYear.value,
      selectedGranularity: "year",
      selectedYear: explicitYear.year,
      selectedMonth: null,
    };
  }

  if (selectedPeriodValue === PERIOD_PRESET_MTD) {
    return {
      ...baseOverview,
      selectedPeriodValue: PERIOD_PRESET_MTD,
      selectedPeriodSpecifier: "mtd",
      selectedPeriodLabel: `${PERIOD_MONTH_NAMES[currentMonth]} ${currentYear}`,
      selectedGranularity: "month",
      selectedYear: currentYear,
      selectedMonth: currentMonth,
    };
  }

  if (selectedPeriodValue === PERIOD_PRESET_YTD) {
    return {
      ...baseOverview,
      selectedPeriodValue: PERIOD_PRESET_YTD,
      selectedPeriodSpecifier: "ytd",
      selectedPeriodLabel: String(currentYear),
      selectedGranularity: "year",
      selectedYear: currentYear,
      selectedMonth: null,
    };
  }

  if (selectedPeriodValue === PERIOD_PRESET_LAST_YEAR) {
    return {
      ...baseOverview,
      selectedPeriodValue: PERIOD_PRESET_LAST_YEAR,
      selectedPeriodSpecifier: "last-year",
      selectedPeriodLabel: String(currentYear - 1),
      selectedGranularity: "year",
      selectedYear: currentYear - 1,
      selectedMonth: null,
    };
  }

  return {
    ...baseOverview,
    selectedPeriodValue: PERIOD_PRESET_LAST_MONTH,
    selectedPeriodSpecifier: "last-month",
    selectedPeriodLabel: `${PERIOD_MONTH_NAMES[lastMonthDate.getUTCMonth()]} ${lastMonthDate.getUTCFullYear()}`,
    selectedGranularity: "month",
    selectedYear: lastMonthDate.getUTCFullYear(),
    selectedMonth: lastMonthDate.getUTCMonth(),
  };
}

const baseOverview: PeriodPageViewProps["overview"] = {
  selectedPeriodValue: DEFAULT_PERIOD_VALUE,
  selectedPeriodSpecifier: "last-month",
  selectedPeriodLabel: "February 2026",
  selectedGranularity: "month",
  selectedYear: 2026,
  selectedMonth: 1,
  periodDateRange: {
    from: "2026-02-01T00:00:00.000Z",
    to: "2026-02-28T00:00:00.000Z",
  },
  minBookingDate: "2021-03-01T00:00:00.000Z",
  maxDate: "2026-03-28T00:00:00.000Z",
  availableYears: [2026, 2025, 2024, 2023, 2022, 2021],
  currentMonthValue: "2026-03",
  currentYearValue: "2026",
  referenceCurrency: "CHF",
  bookingsCount: 92,
  convertedBookingsCount: 90,
  skippedBookingsCount: 2,
  stats: {
    totalReturn: 4200,
    savings: 2500,
    income: 8000,
    expenses: 5500,
    gainsLosses: 1700,
    endOfPeriodNetWorth: 245_000,
    endOfPeriodAssets: 310_000,
    endOfPeriodLiabilities: 65_000,
    explicitGainLoss: 1200,
    realizedGainLoss: 1500,
    unrealizedGainLoss: 200,
  },
  statsRaw: {
    totalReturn: 4200.123456,
    savings: 2500.654321,
    income: 8000.987654,
    expenses: 5500.333333,
    gainsLosses: 1700.469135,
    endOfPeriodNetWorth: 245_000.1234,
    endOfPeriodAssets: 310_000.5678,
    endOfPeriodLiabilities: 65_000.4444,
    explicitGainLoss: 1200.2222,
    realizedGainLoss: 1500.3333,
    unrealizedGainLoss: 200.1358,
  },
  expenseBreakdown: {
    totalAmount: 5500,
    totalAmountRaw: 5500,
    hasHiddenAmountDiscrepancy: false,
    hiddenAmountDiscrepancyNodeIds: [],
    items: [
      {
        id: "group:housing",
        label: "Housing",
        kind: "group",
        amount: 1900,
        percentage: 34.5,
      },
      {
        id: "group:food",
        label: "Food",
        kind: "group",
        amount: 1400,
        percentage: 25.5,
      },
      {
        id: "group:transport",
        label: "Transportation",
        kind: "group",
        amount: 950,
        percentage: 17.3,
      },
      {
        id: "account:account-subscriptions",
        label: "Subscriptions",
        kind: "account",
        amount: 700,
        percentage: 12.7,
      },
      {
        id: "group:other",
        label: "Other",
        kind: "group",
        amount: 550,
        percentage: 10,
      },
    ],
    hierarchy: [
      {
        id: "group:housing",
        label: "Housing",
        kind: "group",
        amount: 1900,
        children: [
          {
            id: "account:account-rent",
            label: "Rent",
            kind: "account",
            amount: 1600,
            children: [],
          },
          {
            id: "account:account-utilities",
            label: "Utilities",
            kind: "account",
            amount: 300,
            children: [],
          },
        ],
      },
      {
        id: "group:food",
        label: "Food",
        kind: "group",
        amount: 1400,
        children: [
          {
            id: "account:account-groceries",
            label: "Groceries",
            kind: "account",
            amount: 900,
            children: [],
          },
          {
            id: "account:account-dining",
            label: "Dining",
            kind: "account",
            amount: 500,
            children: [],
          },
        ],
      },
      {
        id: "group:transport",
        label: "Transportation",
        kind: "group",
        amount: 950,
        children: [
          {
            id: "account:account-transit",
            label: "Transit",
            kind: "account",
            amount: 550,
            children: [],
          },
          {
            id: "account:account-fuel",
            label: "Fuel",
            kind: "account",
            amount: 400,
            children: [],
          },
        ],
      },
      {
        id: "account:account-subscriptions",
        label: "Subscriptions",
        kind: "account",
        amount: 700,
        children: [],
      },
      {
        id: "group:other",
        label: "Other",
        kind: "group",
        amount: 550,
        children: [
          {
            id: "account:account-other-expense",
            label: "Other Expense",
            kind: "account",
            amount: 550,
            children: [],
          },
        ],
      },
    ],
  },
  incomeBreakdown: {
    totalAmount: 8000,
    totalAmountRaw: 8000,
    hasHiddenAmountDiscrepancy: false,
    hiddenAmountDiscrepancyNodeIds: [],
    items: [
      {
        id: "group:salary",
        label: "Salary",
        kind: "group",
        amount: 6200,
        percentage: 77.5,
      },
      {
        id: "group:investments",
        label: "Investments",
        kind: "group",
        amount: 1300,
        percentage: 16.3,
      },
      {
        id: "account:account-other-income",
        label: "Other Income",
        kind: "account",
        amount: 500,
        percentage: 6.3,
      },
    ],
    hierarchy: [
      {
        id: "group:salary",
        label: "Salary",
        kind: "group",
        amount: 6200,
        children: [
          {
            id: "account:account-main-salary",
            label: "Main Salary",
            kind: "account",
            amount: 6200,
            children: [],
          },
        ],
      },
      {
        id: "group:investments",
        label: "Investments",
        kind: "group",
        amount: 1300,
        children: [
          {
            id: "account:account-dividends",
            label: "Dividends",
            kind: "account",
            amount: 900,
            children: [],
          },
          {
            id: "account:account-interest",
            label: "Interest",
            kind: "account",
            amount: 400,
            children: [],
          },
        ],
      },
      {
        id: "account:account-other-income",
        label: "Other Income",
        kind: "account",
        amount: 500,
        children: [],
      },
    ],
  },
  assetBreakdown: {
    totalAmount: 25000,
    totalAmountRaw: 25000,
    hasHiddenAmountDiscrepancy: false,
    hiddenAmountDiscrepancyNodeIds: [],
    skippedMissingReferenceBalanceCount: 1,
    skippedNegativeCount: 1,
    items: [
      {
        id: "group:investments",
        label: "Investments",
        kind: "group",
        amount: 15000,
        percentage: 60,
      },
      {
        id: "group:cash",
        label: "Cash",
        kind: "group",
        amount: 10000,
        percentage: 40,
      },
    ],
    hierarchy: [
      {
        id: "group:investments",
        label: "Investments",
        kind: "group",
        amount: 15000,
        children: [
          {
            id: "account:account-etf",
            label: "ETF Portfolio",
            kind: "account",
            amount: 12000,
            children: [],
          },
          {
            id: "account:account-stocks",
            label: "Stocks",
            kind: "account",
            amount: 3000,
            children: [],
          },
        ],
      },
      {
        id: "group:cash",
        label: "Cash",
        kind: "group",
        amount: 10000,
        children: [
          {
            id: "account:account-checking",
            label: "Checking",
            kind: "account",
            amount: 10000,
            children: [],
          },
        ],
      },
    ],
  },
  liabilityBreakdown: {
    totalAmount: 5400,
    totalAmountRaw: 5400,
    hasHiddenAmountDiscrepancy: false,
    hiddenAmountDiscrepancyNodeIds: [],
    skippedMissingReferenceBalanceCount: 0,
    skippedNegativeCount: 1,
    items: [
      {
        id: "group:debt",
        label: "Debt",
        kind: "group",
        amount: 5400,
        percentage: 100,
      },
    ],
    hierarchy: [
      {
        id: "group:debt",
        label: "Debt",
        kind: "group",
        amount: 5400,
        children: [
          {
            id: "account:account-credit-card",
            label: "Credit Card",
            kind: "account",
            amount: 1400,
            children: [],
          },
          {
            id: "account:account-personal-loan",
            label: "Personal Loan",
            kind: "account",
            amount: 4000,
            children: [],
          },
        ],
      },
    ],
  },
  gainsLossesBreakdown: {
    hierarchy: [
      {
        id: "unit-type:fx",
        label: "FX",
        realizedGainLoss: 200,
        unrealizedGainLoss: 80,
        totalGainLoss: 280,
        children: [
          {
            id: "unit:fx:USD",
            label: "USD",
            realizedGainLoss: 200,
            unrealizedGainLoss: 80,
            totalGainLoss: 280,
            children: [
              {
                id: "unit-account:fx:USD:account-cash-usd-1",
                label: "Cash Account USD 1",
                realizedGainLoss: 120,
                unrealizedGainLoss: 40,
                totalGainLoss: 160,
                children: [],
              },
              {
                id: "unit-account:fx:USD:account-cash-usd-2",
                label: "Cash Account USD 2",
                realizedGainLoss: 80,
                unrealizedGainLoss: 40,
                totalGainLoss: 120,
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: "unit-type:security",
        label: "Security",
        realizedGainLoss: 1000,
        unrealizedGainLoss: 100,
        totalGainLoss: 1100,
        children: [
          {
            id: "unit:security:AAPL:USD",
            label: "AAPL (USD)",
            realizedGainLoss: 1000,
            unrealizedGainLoss: 100,
            totalGainLoss: 1100,
            children: [
              {
                id: "unit-account:security:AAPL:USD:account-aapl-trading",
                label: "AAPL Trading Account",
                realizedGainLoss: 1000,
                unrealizedGainLoss: 100,
                totalGainLoss: 1100,
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: "unit-type:cryptocurrency",
        label: "Cryptocurrency",
        realizedGainLoss: 300,
        unrealizedGainLoss: 20,
        totalGainLoss: 320,
        children: [
          {
            id: "unit:crypto:BTC",
            label: "BTC",
            realizedGainLoss: 300,
            unrealizedGainLoss: 20,
            totalGainLoss: 320,
            children: [
              {
                id: "unit-account:crypto:BTC:account-btc-wallet",
                label: "BTC Wallet",
                realizedGainLoss: 300,
                unrealizedGainLoss: 20,
                totalGainLoss: 320,
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: "unit-type:explicit",
        label: "Explicit G/L",
        realizedGainLoss: 60,
        unrealizedGainLoss: 0,
        totalGainLoss: 60,
        children: [
          {
            id: "explicit-account:account-fees",
            label: "Fees Adjustment Account",
            realizedGainLoss: 60,
            unrealizedGainLoss: 0,
            totalGainLoss: 60,
            children: [],
          },
        ],
      },
    ],
  },
};

function PeriodRouteSmokeHarness() {
  const [selectedPeriodValue, setSelectedPeriodValue] =
    useState<string>(DEFAULT_PERIOD_VALUE);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <Box>
      <PeriodPageView
        accountBookId={STORYBOOK_ACCOUNT_BOOK_ID}
        overview={deriveOverviewFromSelectedPeriodValue(selectedPeriodValue)}
        selectedPeriodValue={selectedPeriodValue}
        onPeriodChange={setSelectedPeriodValue}
        onBreakdownAccountDoubleClick={() => undefined}
        onGainLossUnitAccountDoubleClick={() => undefined}
      />
      <Text data-testid="router-path">{pathname}</Text>
      <Text data-testid="selected-period">{selectedPeriodValue}</Text>
    </Box>
  );
}

const meta = {
  title: "Routes/PeriodPageView",
  component: PeriodPageView,
  decorators: [
    (Story, context) => {
      clearPeriodStorySessionStorage(
        context.args.accountBookId ?? STORYBOOK_ACCOUNT_BOOK_ID,
      );

      return <Story />;
    },
  ],
  args: {
    accountBookId: STORYBOOK_ACCOUNT_BOOK_ID,
    overview: baseOverview,
    selectedPeriodValue: DEFAULT_PERIOD_VALUE,
    onPeriodChange: fn(),
    onBreakdownAccountDoubleClick: fn(),
    onGainLossUnitAccountDoubleClick: fn(),
  },
} satisfies Meta<typeof PeriodPageView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const HappyPath: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const heading = await canvas.findByRole(
      "heading",
      { name: "Period" },
      { timeout: 10000 },
    );
    await expect(heading).toBeInTheDocument();
    const analysisSection = await canvas.findByTestId(
      "period-analysis-section",
    );
    await expect(analysisSection).toBeInTheDocument();
    await expect(
      within(analysisSection).getByRole("heading", {
        name: "Contribution to Total Return",
      }),
    ).toBeInTheDocument();
    await expect(
      within(analysisSection).getByRole("heading", {
        name: "Expenses Breakdown",
      }),
    ).toBeInTheDocument();
    await expect(
      within(analysisSection).getByRole("heading", {
        name: "Assets Allocation",
      }),
    ).toBeInTheDocument();
    await expect(
      within(analysisSection).getByRole("heading", {
        name: "Gains / Losses Breakdown",
      }),
    ).toBeInTheDocument();
    await expect(canvas.queryByText("Total Income")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Total Expenses")).not.toBeInTheDocument();
    const savingsCard = await canvas.findByTestId("period-stat-card-savings");
    await expect(within(savingsCard).getByText("31.3%")).toBeInTheDocument();
    await expect(canvas.getByRole("radio", { name: "Expenses" })).toBeChecked();
    await expect(canvas.getByText("Gain")).toBeInTheDocument();
  },
};

export const ZeroIncomeSavingsRate: Story = {
  args: {
    overview: {
      ...baseOverview,
      stats: {
        ...baseOverview.stats,
        income: 0,
        savings: 0,
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const savingsCard = await canvas.findByTestId("period-stat-card-savings");
    await expect(within(savingsCard).getByText("—")).toBeInTheDocument();
  },
};

export const TopSectionLayoutSmoke: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const topSection = await canvas.findByTestId("period-top-section");
    await expect(topSection).toBeInTheDocument();
    await expect(
      within(topSection).getByTestId("period-picker-trigger"),
    ).toBeInTheDocument();
    await expect(
      within(topSection).queryByRole("heading", { name: "Expenses Breakdown" }),
    ).not.toBeInTheDocument();
  },
};

export const NoExpenseData: Story = {
  args: {
    overview: {
      ...baseOverview,
      expenseBreakdown: {
        totalAmount: 0,
        totalAmountRaw: 0,
        hasHiddenAmountDiscrepancy: false,
        hiddenAmountDiscrepancyNodeIds: [],
        items: [],
        hierarchy: [],
      },
      incomeBreakdown: baseOverview.incomeBreakdown,
      stats: {
        ...baseOverview.stats,
        expenses: 0,
        savings: baseOverview.stats.income,
        totalReturn: baseOverview.stats.income + baseOverview.stats.gainsLosses,
      },
    },
  },
};

export const LossesKpiLabel: Story = {
  args: {
    overview: {
      ...baseOverview,
      stats: {
        ...baseOverview.stats,
        totalReturn: 800,
        gainsLosses: -1700,
        explicitGainLoss: -1200,
        realizedGainLoss: -1500,
        unrealizedGainLoss: -200,
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Loss")).toBeInTheDocument();
    await expect(canvas.queryByText("Gain")).not.toBeInTheDocument();
  },
};

export const FullyConvertible: Story = {
  args: {
    overview: {
      ...baseOverview,
      skippedBookingsCount: 0,
      convertedBookingsCount: baseOverview.bookingsCount,
    },
  },
};

export const RouteSmoke: Story = {
  render: () => <PeriodRouteSmokeHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const yearModeOption = await canvas.findByRole("radio", { name: "Year" });
    await userEvent.click(yearModeOption);
    await expect(canvas.getByTestId("selected-period")).toHaveTextContent(
      "2026",
    );
    await expect(
      canvas.getByRole("button", { name: "Next period" }),
    ).toBeDisabled();

    await userEvent.click(
      canvas.getByRole("button", { name: "Previous period" }),
    );
    await expect(canvas.getByTestId("selected-period")).toHaveTextContent(
      "2025",
    );

    await userEvent.click(canvas.getByTestId("period-picker-trigger"));
    const yearPicker = await canvas.findByTestId("period-year-picker");
    await userEvent.click(
      within(yearPicker).getByRole("button", { name: "2024" }),
    );
    await expect(canvas.getByTestId("selected-period")).toHaveTextContent(
      "2024",
    );

    const monthModeOption = await canvas.findByRole("radio", { name: "Month" });
    await userEvent.click(monthModeOption);
    await expect(canvas.getByTestId("selected-period")).toHaveTextContent(
      "2024-12",
    );

    await userEvent.click(canvas.getByTestId("period-picker-trigger"));
    const monthPicker = await canvas.findByTestId("period-month-picker");
    await userEvent.click(
      within(monthPicker).getByRole("button", { name: /Nov/i }),
    );
    await expect(canvas.getByTestId("selected-period")).toHaveTextContent(
      formatMonthPeriodValue(2024, 10),
    );

    const accountsLink = await canvas.findByRole("link", {
      name: "Accounts",
    });
    await userEvent.click(accountsLink);
    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/storybook-book/accounts",
    );
  },
};

export const BreakdownToggleSmoke: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const incomeOption = await canvas.findByRole("radio", { name: "Income" });
    await userEvent.click(incomeOption);
    await expect(incomeOption).toBeChecked();
    await expect(
      canvas.getByRole("heading", { name: "Income Breakdown" }),
    ).toBeInTheDocument();

    const breakdownChartTypeControl = await canvas.findByLabelText(
      "Breakdown chart type",
    );
    const barOption = within(breakdownChartTypeControl).getByRole("radio", {
      name: "Bar",
    });
    await userEvent.click(barOption);
    await expect(barOption).toBeChecked();
    await expect(
      within(breakdownChartTypeControl).getByRole("radio", {
        name: "Table",
      }),
    ).toBeInTheDocument();

    await expect(
      canvas.getByText("Top-level groups for income in the selected period"),
    ).toBeInTheDocument();
  },
};

export const AllocationToggleSmoke: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const liabilitiesOption = await canvas.findByRole("radio", {
      name: "Liabilities",
    });
    await userEvent.click(liabilitiesOption);
    await expect(liabilitiesOption).toBeChecked();
    await expect(
      canvas.getByRole("heading", { name: "Liabilities Allocation" }),
    ).toBeInTheDocument();

    await expect(
      canvas.getByText(/Top-level liability groups as of period end/i),
    ).toBeInTheDocument();

    const allocationChartTypeControl = await canvas.findByLabelText(
      "Allocation chart type",
    );
    const allocationBarOption = within(allocationChartTypeControl).getByRole(
      "radio",
      {
        name: "Bar",
      },
    );
    await userEvent.click(allocationBarOption);
    await expect(allocationBarOption).toBeChecked();
    await expect(
      within(allocationChartTypeControl).getByRole("radio", {
        name: "Table",
      }),
    ).toBeInTheDocument();
  },
};

export const BreakdownTableModeSmoke: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const breakdownChartTypeControl = await canvas.findByLabelText(
      "Breakdown chart type",
    );
    const tableOption = within(breakdownChartTypeControl).getByRole("radio", {
      name: "Table",
    });
    await userEvent.click(tableOption);
    await expect(tableOption).toBeChecked();
    const breakdownTable = canvas.getByTestId("period-breakdown-table");
    await expect(breakdownTable).toBeInTheDocument();
    await expect(
      await within(breakdownTable).findByText("Total"),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByTestId("period-breakdown-chart"),
    ).not.toBeInTheDocument();
  },
};

export const AllocationTableModeSmoke: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const allocationChartTypeControl = await canvas.findByLabelText(
      "Allocation chart type",
    );
    const tableOption = within(allocationChartTypeControl).getByRole("radio", {
      name: "Table",
    });
    await userEvent.click(tableOption);
    await expect(tableOption).toBeChecked();
    const allocationTable = canvas.getByTestId(
      "period-allocation-breakdown-table",
    );
    await expect(allocationTable).toBeInTheDocument();
    await expect(
      await within(allocationTable).findByText("Total"),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByTestId("period-allocation-breakdown-chart"),
    ).not.toBeInTheDocument();
  },
};

export const BreakdownTableDoubleClickSmoke: Story = {
  args: {
    onBreakdownAccountDoubleClick: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    const breakdownChartTypeControl = await canvas.findByLabelText(
      "Breakdown chart type",
    );
    await userEvent.click(
      within(breakdownChartTypeControl).getByRole("radio", {
        name: "Table",
      }),
    );

    await userEvent.dblClick(canvas.getByText("Housing"));
    await expect(args.onBreakdownAccountDoubleClick).not.toHaveBeenCalled();

    await userEvent.dblClick(canvas.getByText("Subscriptions"));
    await expect(args.onBreakdownAccountDoubleClick).toHaveBeenCalledWith(
      "account-subscriptions",
    );
    await expect(args.onBreakdownAccountDoubleClick).toHaveBeenCalledTimes(1);

    await userEvent.dblClick(canvas.getByText("Total"));
    await expect(args.onBreakdownAccountDoubleClick).toHaveBeenCalledTimes(1);
  },
};

export const AllocationTableDoubleClickSmoke: Story = {
  args: {
    onBreakdownAccountDoubleClick: fn(),
    overview: {
      ...baseOverview,
      assetBreakdown: {
        ...baseOverview.assetBreakdown,
        items: [
          {
            id: "group:investments",
            label: "Investments",
            kind: "group",
            amount: 12000,
            percentage: 48,
          },
          {
            id: "account:account-allocation-test",
            label: "Allocation Test Account",
            kind: "account",
            amount: 13000,
            percentage: 52,
          },
        ],
        hierarchy: [
          {
            id: "group:investments",
            label: "Investments",
            kind: "group",
            amount: 12000,
            children: [],
          },
          {
            id: "account:account-allocation-test",
            label: "Allocation Test Account",
            kind: "account",
            amount: 13000,
            children: [],
          },
        ],
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    const allocationChartTypeControl = await canvas.findByLabelText(
      "Allocation chart type",
    );
    await userEvent.click(
      within(allocationChartTypeControl).getByRole("radio", {
        name: "Table",
      }),
    );

    await userEvent.dblClick(canvas.getByText("Investments"));
    await expect(args.onBreakdownAccountDoubleClick).not.toHaveBeenCalled();

    await userEvent.dblClick(canvas.getByText("Allocation Test Account"));
    await expect(args.onBreakdownAccountDoubleClick).toHaveBeenCalledWith(
      "account-allocation-test",
    );
    await expect(args.onBreakdownAccountDoubleClick).toHaveBeenCalledTimes(1);

    await userEvent.dblClick(canvas.getByText("Total"));
    await expect(args.onBreakdownAccountDoubleClick).toHaveBeenCalledTimes(1);
  },
};

export const AllocationChartContainerDoubleClickSmoke: Story = {
  args: {
    onBreakdownAccountDoubleClick: fn(),
    overview: {
      ...baseOverview,
      assetBreakdown: {
        ...baseOverview.assetBreakdown,
        items: [
          {
            id: "account:account-allocation-chart-only",
            label: "Allocation Chart Account",
            kind: "account",
            amount: 25000,
            percentage: 100,
          },
        ],
        hierarchy: [
          {
            id: "account:account-allocation-chart-only",
            label: "Allocation Chart Account",
            kind: "account",
            amount: 25000,
            children: [],
          },
        ],
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    const allocationChart = await canvas.findByTestId(
      "period-allocation-breakdown-chart",
    );
    await userEvent.dblClick(allocationChart);

    await expect(args.onBreakdownAccountDoubleClick).toHaveBeenCalledWith(
      "account-allocation-chart-only",
    );
    await expect(args.onBreakdownAccountDoubleClick).toHaveBeenCalledTimes(1);
  },
};

export const AllocationTableVirtualAccountDoubleClickIgnoredSmoke: Story = {
  args: {
    onBreakdownAccountDoubleClick: fn(),
    overview: {
      ...baseOverview,
      assetBreakdown: {
        ...baseOverview.assetBreakdown,
        items: [
          {
            id: "account:virtual:transfer-clearing:account:currency:CHF",
            label: "Transfer Clearing (CHF)",
            kind: "account",
            amount: 25000,
            percentage: 100,
          },
        ],
        hierarchy: [
          {
            id: "account:virtual:transfer-clearing:account:currency:CHF",
            label: "Transfer Clearing (CHF)",
            kind: "account",
            amount: 25000,
            children: [],
          },
        ],
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    const allocationChartTypeControl = await canvas.findByLabelText(
      "Allocation chart type",
    );
    await userEvent.click(
      within(allocationChartTypeControl).getByRole("radio", {
        name: "Table",
      }),
    );

    await userEvent.dblClick(canvas.getByText("Transfer Clearing (CHF)"));
    await expect(args.onBreakdownAccountDoubleClick).not.toHaveBeenCalled();
  },
};

export const AllocationChartVirtualAccountDoubleClickIgnoredSmoke: Story = {
  args: {
    onBreakdownAccountDoubleClick: fn(),
    overview: {
      ...baseOverview,
      assetBreakdown: {
        ...baseOverview.assetBreakdown,
        items: [
          {
            id: "account:virtual:transfer-clearing:account:currency:CHF",
            label: "Transfer Clearing (CHF)",
            kind: "account",
            amount: 25000,
            percentage: 100,
          },
        ],
        hierarchy: [
          {
            id: "account:virtual:transfer-clearing:account:currency:CHF",
            label: "Transfer Clearing (CHF)",
            kind: "account",
            amount: 25000,
            children: [],
          },
        ],
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    const allocationChart = await canvas.findByTestId(
      "period-allocation-breakdown-chart",
    );
    await userEvent.dblClick(allocationChart);

    await expect(args.onBreakdownAccountDoubleClick).not.toHaveBeenCalled();
  },
};

export const GainsLossesToggleSmoke: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const gainsLossesChartTypeControl = await canvas.findByLabelText(
      "Gains/losses chart type",
    );
    const tableOption = within(gainsLossesChartTypeControl).getByRole("radio", {
      name: "Table",
    });
    await userEvent.click(tableOption);
    await expect(tableOption).toBeChecked();
    await expect(
      canvas.getByTestId("period-gains-losses-breakdown-table"),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByTestId("period-gains-losses-breakdown-chart"),
    ).not.toBeInTheDocument();

    const waterfallOption = within(gainsLossesChartTypeControl).getByRole(
      "radio",
      {
        name: "Waterfall",
      },
    );
    await userEvent.click(waterfallOption);
    await expect(waterfallOption).toBeChecked();
    await expect(
      canvas.getByTestId("period-gains-losses-breakdown-chart"),
    ).toBeInTheDocument();
  },
};

export const GainsLossesDrillSmoke: Story = {
  args: {
    overview: {
      ...baseOverview,
      gainsLossesBreakdown: {
        hierarchy: [
          {
            id: "unit-type:fx",
            label: "FX",
            realizedGainLoss: 200,
            unrealizedGainLoss: 80,
            totalGainLoss: 280,
            children: [
              {
                id: "unit:fx:USD",
                label: "USD",
                realizedGainLoss: 200,
                unrealizedGainLoss: 80,
                totalGainLoss: 280,
                children: [
                  {
                    id: "unit-account:fx:USD:account-cash-usd-1",
                    label: "Cash Account USD 1",
                    realizedGainLoss: 120,
                    unrealizedGainLoss: 40,
                    totalGainLoss: 160,
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const gainsLossesChart = await canvas.findByTestId(
      "period-gains-losses-breakdown-chart",
    );
    await expect(
      canvas.getByText(
        "Top-level groups for gains/losses in the selected period",
      ),
    ).toBeInTheDocument();

    await userEvent.dblClick(gainsLossesChart);
    await expect(
      canvas.getByText("Drilled gains/losses in the selected period"),
    ).toBeInTheDocument();
    await expect(canvas.getByText("FX")).toBeInTheDocument();

    await userEvent.dblClick(gainsLossesChart);
    await expect(canvas.getByText("USD")).toBeInTheDocument();
  },
};

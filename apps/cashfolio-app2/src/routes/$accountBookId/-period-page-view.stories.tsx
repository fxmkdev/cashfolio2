import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Text } from "@mantine/core";
import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import {
  formatMonthPeriodValue,
  parseExplicitMonthPeriod,
  parseExplicitYearPeriod,
} from "../../shared/period";
import {
  DEFAULT_PERIOD_VALUE,
  PERIOD_PRESET_LAST_MONTH,
  PERIOD_PRESET_LAST_YEAR,
  PERIOD_PRESET_MTD,
  PERIOD_PRESET_YTD,
} from "./-period-page-types";
import { PeriodPageView, type PeriodPageViewProps } from "./-period-page-view";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

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
      selectedPeriodLabel: `${MONTH_NAMES[explicitMonth.month]} ${explicitMonth.year}`,
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
      selectedPeriodLabel: `${MONTH_NAMES[currentMonth]} ${currentYear}`,
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
    selectedPeriodLabel: `${MONTH_NAMES[lastMonthDate.getUTCMonth()]} ${lastMonthDate.getUTCFullYear()}`,
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
    totalIncome: 8000,
    totalExpenses: 5500,
    gainsLosses: 1700,
    explicitGainLoss: 1200,
    transactionGainLoss: 300,
    holdingGainLoss: 200,
  },
  expenseBreakdown: {
    totalAmount: 5500,
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
};

function PeriodRouteSmokeHarness() {
  const [selectedPeriodValue, setSelectedPeriodValue] =
    useState<string>(DEFAULT_PERIOD_VALUE);
  const [drillPathByBreakdown, setDrillPathByBreakdown] = useState<
    Record<"expense" | "income", string[]>
  >({
    expense: [],
    income: [],
  });
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <Box>
      <PeriodPageView
        accountBookId="storybook-book"
        overview={deriveOverviewFromSelectedPeriodValue(selectedPeriodValue)}
        selectedPeriodValue={selectedPeriodValue}
        drillPathByBreakdown={drillPathByBreakdown}
        onPeriodChange={setSelectedPeriodValue}
        onDrillPathByBreakdownChange={setDrillPathByBreakdown}
      />
      <Text data-testid="router-path">{pathname}</Text>
      <Text data-testid="selected-period">{selectedPeriodValue}</Text>
    </Box>
  );
}

const meta = {
  title: "Routes/PeriodPageView",
  component: PeriodPageView,
  args: {
    accountBookId: "storybook-book",
    overview: baseOverview,
    selectedPeriodValue: DEFAULT_PERIOD_VALUE,
    drillPathByBreakdown: {
      expense: [],
      income: [],
    },
    onPeriodChange: fn(),
    onDrillPathByBreakdownChange: fn(),
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
      within(topSection).queryByRole("heading", { name: "Expense Breakdown" }),
    ).not.toBeInTheDocument();
  },
};

export const NoExpenseData: Story = {
  args: {
    overview: {
      ...baseOverview,
      expenseBreakdown: {
        totalAmount: 0,
        items: [],
        hierarchy: [],
      },
      incomeBreakdown: baseOverview.incomeBreakdown,
      stats: {
        ...baseOverview.stats,
        totalExpenses: 0,
      },
    },
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

    const upButton = await canvas.findByRole("button", { name: "Up" });
    await expect(upButton).toBeDisabled();
    await expect(canvas.getByText("All Expenses")).toBeInTheDocument();

    const incomeOption = await canvas.findByRole("radio", { name: "Income" });
    await userEvent.click(incomeOption);
    await expect(incomeOption).toBeChecked();
    await expect(
      canvas.getByRole("heading", { name: "Income Breakdown" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("All Income")).toBeInTheDocument();

    const barOption = await canvas.findByRole("radio", { name: "Bar" });
    await userEvent.click(barOption);
    await expect(barOption).toBeChecked();
  },
};

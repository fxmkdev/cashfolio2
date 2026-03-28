import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Text } from "@mantine/core";
import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { DEFAULT_PERIOD_VALUE, PERIOD_PRESET_YTD } from "./-period-page-types";
import { PeriodPageView, type PeriodPageViewProps } from "./-period-page-view";

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
        accountBookId="storybook-book"
        overview={{
          ...baseOverview,
          selectedPeriodValue,
          selectedPeriodSpecifier:
            selectedPeriodValue === PERIOD_PRESET_YTD ? "ytd" : "last-month",
          selectedPeriodLabel:
            selectedPeriodValue === PERIOD_PRESET_YTD
              ? "2026"
              : "February 2026",
          selectedGranularity:
            selectedPeriodValue === PERIOD_PRESET_YTD ? "year" : "month",
          selectedYear: 2026,
          selectedMonth: selectedPeriodValue === PERIOD_PRESET_YTD ? null : 1,
        }}
        selectedPeriodValue={selectedPeriodValue}
        onPeriodChange={setSelectedPeriodValue}
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
    onPeriodChange: fn(),
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

export const NoExpenseData: Story = {
  args: {
    overview: {
      ...baseOverview,
      expenseBreakdown: {
        totalAmount: 0,
        items: [],
      },
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

    const yearToDateOption = await canvas.findByRole("option", {
      name: "Year to Date",
    });
    await userEvent.selectOptions(
      canvas.getByLabelText("Period"),
      yearToDateOption,
    );

    await expect(canvas.getByTestId("selected-period")).toHaveTextContent(
      PERIOD_PRESET_YTD,
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

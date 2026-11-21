import type { StoryObj } from "@storybook/react-vite";
import { Box, Text } from "@mantine/core";
import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { expect, screen, userEvent, within } from "storybook/test";
import {
  formatMonthPeriodValue,
  DEFAULT_PERIOD_VALUE,
} from "@/shared/reporting/period";
import { ReportPageView } from "./-page-view";
import {
  STORYBOOK_ACCOUNT_BOOK_ID,
  baseOverview,
  deriveOverviewFromSelectedPeriodValue,
} from "./-page-view.story-fixtures";
import { reportPageStoryMeta } from "./-page-view.story-meta";

const meta = { ...reportPageStoryMeta, title: "Screens/Report/Overview" };
export default meta;
type Story = StoryObj<typeof meta>;

function PeriodRouteSmokeHarness() {
  const [selectedPeriodValue, setSelectedPeriodValue] =
    useState<string>(DEFAULT_PERIOD_VALUE);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <Box>
      <ReportPageView
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

export const HappyPath: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const heading = await canvas.findByRole(
      "heading",
      { name: "February 2026" },
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
        name: "Gains/Losses Breakdown",
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

export const HeaderActionLayoutSmoke: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByTestId("period-top-section")).toBeNull();
    await expect(
      canvas.getByTestId("period-picker-trigger"),
    ).toBeInTheDocument();
    const analysisSection = await canvas.findByTestId(
      "period-analysis-section",
    );
    await expect(
      within(analysisSection).getByRole("heading", {
        name: "Expenses Breakdown",
      }),
    ).toBeInTheDocument();
  },
  name: "Header Action Layout Smoke Interaction Test",
  tags: ["regression", "!autodocs"],
};

export const NoExpenseData: Story = {
  args: {
    overview: {
      ...baseOverview,
      expenseBreakdown: {
        totalAmount: 0,
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
  parameters: {
    router: {
      initialPath: "/storybook-book/report",
    },
  },
  render: () => <PeriodRouteSmokeHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByTestId("period-picker-trigger"));

    const yearModeOption = await screen.findByRole("radio", { name: "Year" });
    await userEvent.click(yearModeOption);
    await expect(canvas.getByTestId("selected-period")).toHaveTextContent(
      "2026",
    );
    await expect(
      canvas.getByRole("button", { name: "Next Period" }),
    ).toBeDisabled();

    await userEvent.click(
      canvas.getByRole("button", { name: "Previous Period" }),
    );
    await expect(canvas.getByTestId("selected-period")).toHaveTextContent(
      "2025",
    );

    await userEvent.click(canvas.getByTestId("period-picker-trigger"));
    const yearPicker = await screen.findByTestId("period-year-picker");
    await userEvent.click(
      within(yearPicker).getByRole("button", { name: "2024" }),
    );
    await expect(canvas.getByTestId("selected-period")).toHaveTextContent(
      "2024",
    );

    await userEvent.click(canvas.getByTestId("period-picker-trigger"));

    const monthModeOption = await screen.findByRole("radio", {
      name: "Month",
    });
    await userEvent.click(monthModeOption);
    await expect(canvas.getByTestId("selected-period")).toHaveTextContent(
      "2024-12",
    );

    const monthPicker = await screen.findByTestId("period-month-picker");
    await userEvent.click(
      within(monthPicker).getByRole("button", { name: /Nov/i }),
    );
    await expect(canvas.getByTestId("selected-period")).toHaveTextContent(
      formatMonthPeriodValue(2024, 10),
    );
    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/storybook-book/report",
    );
  },
  name: "Route Smoke Interaction Test",
  tags: ["regression", "!autodocs"],
};

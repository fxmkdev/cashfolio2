import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Text } from "@mantine/core";
import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { expect, fn, screen, userEvent, within } from "storybook/test";
import { formatMonthPeriodValue } from "@/shared/period";
import { DEFAULT_PERIOD_VALUE } from "./-page-types";
import { ReportPageView } from "./-page-view";

import {
  STORYBOOK_ACCOUNT_BOOK_ID,
  baseOverview,
  clearReportStorySessionStorage,
  deriveOverviewFromSelectedPeriodValue,
} from "./-page-view.story-fixtures";

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

const meta = {
  title: "Routes/ReportPageView",
  component: ReportPageView,
  decorators: [
    (Story, context) => {
      clearReportStorySessionStorage(
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
} satisfies Meta<typeof ReportPageView>;

export default meta;

type Story = StoryObj<typeof meta>;

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
      "Breakdown Chart Type",
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
      "Allocation Chart Type",
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
      "Breakdown Chart Type",
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
      "Allocation Chart Type",
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
      "Breakdown Chart Type",
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
      "Allocation Chart Type",
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
      "Allocation Chart Type",
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
      "Gains/Losses Chart Type",
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
        "Top-Level Groups for Gains/Losses in the Selected Period",
      ),
    ).toBeInTheDocument();

    await userEvent.dblClick(gainsLossesChart);
    await expect(
      canvas.getByText("Drilled Gains/Losses in the Selected Period"),
    ).toBeInTheDocument();
    await expect(canvas.getByText("FX")).toBeInTheDocument();

    await userEvent.dblClick(gainsLossesChart);
    await expect(canvas.getByText("USD")).toBeInTheDocument();
  },
};

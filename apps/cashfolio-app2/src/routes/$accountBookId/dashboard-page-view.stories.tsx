import type { Meta, StoryObj } from "@storybook/react-vite";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Box, Text } from "@mantine/core";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { DASHBOARD_PERIOD_12M } from "../../shared/dashboard-period";
import {
  DashboardPageView,
  type DashboardPageViewProps,
} from "./dashboard-page-view";

const baseOverview: DashboardPageViewProps["overview"] = {
  periodLabel: "Last 12 months",
  noBookingsMessage:
    "No income or expense bookings found in the last 12 months.",
  referenceCurrency: "CHF",
  bookingsCount: 24,
  convertedBookingsCount: 24,
  skippedBookingsCount: 0,
  points: [
    {
      bucketStart: "2025-11-01T00:00:00.000Z",
      bucketLabel: "Nov 2025",
      income: 7600,
      expense: 4200,
      net: 3400,
    },
    {
      bucketStart: "2025-12-01T00:00:00.000Z",
      bucketLabel: "Dec 2025",
      income: 7400,
      expense: 4500,
      net: 2900,
    },
    {
      bucketStart: "2026-01-01T00:00:00.000Z",
      bucketLabel: "Jan 2026",
      income: 7800,
      expense: 5000,
      net: 2800,
    },
  ],
};

function DashboardRouteSmokeHarness() {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] =
    useState<DashboardPageViewProps["selectedPeriod"]>(DASHBOARD_PERIOD_12M);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <Box>
      <DashboardPageView
        overview={baseOverview}
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        onNavigateToAccounts={() =>
          navigate({
            to: "/$accountBookId/accounts",
            params: { accountBookId: "storybook-book" },
            search: { tab: "ASSET", mode: "active" },
          })
        }
      />
      <Text data-testid="router-path">{pathname}</Text>
    </Box>
  );
}

const meta = {
  title: "Routes/DashboardPageView",
  component: DashboardPageView,
  args: {
    overview: baseOverview,
    selectedPeriod: DASHBOARD_PERIOD_12M,
    onPeriodChange: fn(),
    onNavigateToAccounts: fn(),
  },
} satisfies Meta<typeof DashboardPageView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const HappyPath: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const heading = await canvas.findByRole(
      "heading",
      { name: "Dashboard" },
      { timeout: 10000 },
    );
    await expect(heading).toBeInTheDocument();
    const accountsButton = await canvas.findByRole(
      "button",
      { name: "Accounts" },
      { timeout: 10000 },
    );
    await userEvent.click(accountsButton);
  },
};

export const NoConvertibleData: Story = {
  args: {
    overview: {
      ...baseOverview,
      bookingsCount: 8,
      convertedBookingsCount: 0,
    },
  },
};

export const PartialData: Story = {
  args: {
    overview: {
      ...baseOverview,
      skippedBookingsCount: 3,
    },
  },
};

export const RouteSmoke: Story = {
  render: () => <DashboardRouteSmokeHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const accountsButton = await canvas.findByRole(
      "button",
      { name: "Accounts" },
      { timeout: 10000 },
    );
    await userEvent.click(accountsButton);
    const routerPath = await canvas.findByTestId(
      "router-path",
      {},
      {
        timeout: 10000,
      },
    );
    await expect(routerPath).toHaveTextContent("/storybook-book/accounts");
  },
};

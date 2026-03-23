import type { Meta, StoryObj } from "@storybook/react-vite";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Box, Text } from "@mantine/core";
import { expect, fn, userEvent, within } from "storybook/test";
import {
  DashboardPageView,
  type DashboardPageViewProps,
} from "./dashboard-page-view";

const baseOverview: DashboardPageViewProps["overview"] = {
  periodLabel: "Last 12 months",
  referenceCurrency: "CHF",
  bookingsCount: 24,
  convertedBookingsCount: 24,
  skippedBookingsCount: 0,
  points: [
    {
      monthStart: "2025-11-01T00:00:00.000Z",
      monthLabel: "Nov 2025",
      income: 7600,
      expense: 4200,
      net: 3400,
    },
    {
      monthStart: "2025-12-01T00:00:00.000Z",
      monthLabel: "Dec 2025",
      income: 7400,
      expense: 4500,
      net: 2900,
    },
    {
      monthStart: "2026-01-01T00:00:00.000Z",
      monthLabel: "Jan 2026",
      income: 7800,
      expense: 5000,
      net: 2800,
    },
  ],
};

function DashboardRouteSmokeHarness() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <Box>
      <DashboardPageView
        overview={baseOverview}
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
    onNavigateToAccounts: fn(),
  },
} satisfies Meta<typeof DashboardPageView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const HappyPath: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Accounts" }));
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
    await userEvent.click(canvas.getByRole("button", { name: "Accounts" }));
    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/storybook-book/accounts",
    );
  },
};

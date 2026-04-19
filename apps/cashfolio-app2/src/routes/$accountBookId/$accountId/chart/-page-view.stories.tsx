import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRouterState } from "@tanstack/react-router";
import { Box, Text } from "@mantine/core";
import { expect, userEvent, within } from "storybook/test";
import { AccountType, Unit } from "@/.prisma-client/enums";
import { LedgerBalanceChartPageView } from "./-page-view";
import { LedgerViewSegmentedControl } from "../-view-segmented-control";

function LedgerBalanceChartPageStoryHarness({
  routeSmoke = false,
}: {
  routeSmoke?: boolean;
}) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <Box>
      <LedgerBalanceChartPageView
        accountBookId="storybook-book"
        backTab="ASSET"
        account={{
          id: "account-checking",
          name: "Checking",
          isActive: true,
          type: AccountType.ASSET,
          equityAccountSubtype: null,
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
          groupPathSegments: ["Assets", "Cash"],
        }}
        unitLabel="CHF"
        points={[
          {
            date: new Date("2026-01-10T00:00:00"),
            dateKey: "2026-01-10",
            dateLabel: "10.01.2026",
            balance: 1000,
          },
          {
            date: new Date("2026-01-15T00:00:00"),
            dateKey: "2026-01-15",
            dateLabel: "15.01.2026",
            balance: 915.5,
          },
        ]}
        formatBalance={(value) =>
          new Intl.NumberFormat("en-CH", {
            style: "currency",
            currency: "CHF",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(value)
        }
        viewSwitcher={
          <LedgerViewSegmentedControl
            accountBookId="storybook-book"
            accountId="account-checking"
            view="chart"
          />
        }
      />
      {routeSmoke ? <Text data-testid="router-path">{pathname}</Text> : null}
    </Box>
  );
}

const meta: Meta<typeof LedgerBalanceChartPageView> = {
  title: "Routes/LedgerBalanceChartPageView",
  component: LedgerBalanceChartPageView,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const HappyPath: Story = {
  render: () => <LedgerBalanceChartPageStoryHarness />,
};

export const RouteSmoke: Story = {
  render: () => <LedgerBalanceChartPageStoryHarness routeSmoke={true} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("link", { name: "Ledger" }));

    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/storybook-book/account-checking",
    );
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@mantine/core";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { ReportPageView } from "./-page-view";
import {
  baseOverview,
  clearReportStorySessionStorage,
  STORYBOOK_ACCOUNT_BOOK_ID,
} from "./-page-view.story-fixtures";

function overviewForBalances(bank: number, card: number): typeof baseOverview {
  const positions = [
    {
      id: "bank",
      label: "Bank Account",
      groupId: "banking",
      groupLabel: "Banking",
      balance: bank,
    },
    {
      id: "card",
      label: "Credit Card",
      groupId: "cards",
      groupLabel: "Cards",
      balance: card,
    },
  ];
  const allocation = (
    side: "asset" | "liability",
  ): typeof baseOverview.assetBreakdown => {
    const relevant = positions.filter(({ balance }) =>
      side === "asset" ? balance > 0 : balance < 0,
    );
    const totalAmount = relevant.reduce(
      (sum, p) => sum + Math.abs(p.balance),
      0,
    );
    return {
      totalAmount,
      hasHiddenAmountDiscrepancy: false,
      hiddenAmountDiscrepancyNodeIds: [],
      skippedMissingReferenceBalanceCount: 0,
      items: relevant.map((p) => ({
        id: `group:${p.groupId}`,
        label: p.groupLabel,
        kind: "group",
        amount: Math.abs(p.balance),
        percentage: (Math.abs(p.balance) / totalAmount) * 100,
      })),
      hierarchy: relevant.map((p) => ({
        id: `group:${p.groupId}`,
        label: p.groupLabel,
        kind: "group",
        amount: Math.abs(p.balance),
        children: [
          {
            id: `account:${p.id}`,
            label: p.label,
            kind: "account",
            amount: Math.abs(p.balance),
            children: [],
          },
        ],
      })),
    };
  };
  return {
    ...baseOverview,
    stats: {
      ...baseOverview.stats,
      endOfPeriodAssets: allocation("asset").totalAmount,
      endOfPeriodLiabilities: allocation("liability").totalAmount,
      endOfPeriodNetWorth: bank + card,
    },
    assetBreakdown: allocation("asset"),
    liabilityBreakdown: allocation("liability"),
  };
}

const meta = {
  title: "Routes/ReportBalanceAllocation",
  component: ReportPageView,
  decorators: [
    (Story) => {
      clearReportStorySessionStorage(STORYBOOK_ACCOUNT_BOOK_ID);
      return <Story />;
    },
  ],
  args: {
    accountBookId: STORYBOOK_ACCOUNT_BOOK_ID,
    overview: overviewForBalances(-50, 20),
    selectedPeriodValue: "2026-02",
    onPeriodChange: fn(),
    onBreakdownAccountDoubleClick: fn(),
    onGainLossUnitAccountDoubleClick: fn(),
  },
} satisfies Meta<typeof ReportPageView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OverdraftAndOverpayment: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(
        "Assets include positive account balances at period end, regardless of account type.",
      ),
    ).toBeVisible();
    await userEvent.click(
      within(canvas.getByLabelText("Allocation Chart Type")).getByRole(
        "radio",
        { name: "Table" },
      ),
    );
    const table = within(
      await canvas.findByTestId("period-allocation-breakdown-table"),
    );
    await expect(await table.findByText("Credit Card")).toBeVisible();
    await expect(table.queryByText("Bank Account")).not.toBeInTheDocument();
    await userEvent.click(
      within(canvas.getByLabelText("Allocation Type")).getByRole("radio", {
        name: "Liabilities",
      }),
    );
    await expect(await table.findByText("Bank Account")).toBeVisible();
    await waitFor(() =>
      expect(table.queryByText("Credit Card")).not.toBeInTheDocument(),
    );
    await userEvent.dblClick(table.getByText("Bank Account"));
    await waitFor(() =>
      expect(args.onBreakdownAccountDoubleClick).toHaveBeenCalledWith("bank"),
    );
    await expect(
      canvas.queryByText(/excluded from allocation/),
    ).not.toBeInTheDocument();
    const allocationCard = within(
      canvas
        .getByRole("heading", { name: "Liabilities Allocation" })
        .closest<HTMLElement>(".mantine-Card-root")!,
    );
    await expect(
      allocationCard.queryByText("Partial Data"),
    ).not.toBeInTheDocument();
  },
};

export const AllBalancesOwed: Story = {
  args: { overview: overviewForBalances(-50, -20) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(
        "No positive, convertible account balances were found as of period end.",
      ),
    ).toBeVisible();
    await userEvent.click(
      within(canvas.getByLabelText("Allocation Type")).getByRole("radio", {
        name: "Liabilities",
      }),
    );
    await expect(
      await canvas.findByTestId("period-allocation-breakdown-chart"),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "Liabilities show amounts owed from negative account balances at period end, regardless of account type.",
      ),
    ).toBeVisible();
  },
};

export const MissingValuationsOnBothSides: Story = {
  args: { overview: baseOverview },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const note =
      "1 account was skipped because reference-currency balances were unavailable. This affects both asset and liability allocations.";
    await expect(await canvas.findByText(note)).toBeVisible();
    await userEvent.click(
      within(canvas.getByLabelText("Allocation Type")).getByRole("radio", {
        name: "Liabilities",
      }),
    );
    await expect(canvas.getByText(note)).toBeVisible();
  },
};

function ZeroCrossingHarness() {
  const [changed, setChanged] = useState(false);
  return (
    <>
      <Button onClick={() => setChanged(true)}>Next Reporting Period</Button>
      <ReportPageView
        {...meta.args}
        overview={
          changed ? overviewForBalances(-50, 20) : overviewForBalances(100, -40)
        }
        selectedPeriodValue={changed ? "2026-03" : "2026-02"}
      />
    </>
  );
}

export const PeriodSwitchClampsDrillPath: Story = {
  render: () => <ZeroCrossingHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.dblClick(
      await canvas.findByTestId("period-allocation-breakdown-chart"),
    );
    await expect(
      await canvas.findByText(
        "Drilled asset groups as of period end · Amounts shown in CHF",
      ),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Next Reporting Period" }),
    );
    await expect(
      await canvas.findByText(
        "Top-level asset groups as of period end · Amounts shown in CHF",
      ),
    ).toBeVisible();
    await userEvent.click(
      within(canvas.getByLabelText("Allocation Chart Type")).getByRole(
        "radio",
        { name: "Table" },
      ),
    );
    const table = within(
      await canvas.findByTestId("period-allocation-breakdown-table"),
    );
    await expect(await table.findByText("Credit Card")).toBeVisible();
    await expect(table.queryByText("Bank Account")).not.toBeInTheDocument();
  },
};

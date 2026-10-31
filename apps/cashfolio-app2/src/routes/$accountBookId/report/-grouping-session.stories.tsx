import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@mantine/core";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { ReportPageView } from "./-page-view";
import {
  baseOverview,
  deriveOverviewFromSelectedPeriodValue,
  withAccountBreakdowns,
} from "./-page-view.story-fixtures";
import { getDefaultReportPageSessionState } from "./-selector/-page-session-state";

const firstBookId = "grouping-first-book";
const secondBookId = "grouping-second-book";
const secondOverview = withAccountBreakdowns({
  gainsLossesBreakdown: {
    hierarchy:
      baseOverview.accountBreakdownsByGrouping.accountStructure.gainsLossesBreakdown.hierarchy.filter(
        (node) => node.id === "group:investments",
      ),
  },
});

function BookSwitchHarness() {
  const [bookId, setBookId] = useState(firstBookId);
  return (
    <>
      <Button
        onClick={() =>
          setBookId((previous) =>
            previous === firstBookId ? secondBookId : firstBookId,
          )
        }
      >
        Switch Account Book
      </Button>
      <ReportPageView
        accountBookId={bookId}
        overview={bookId === firstBookId ? baseOverview : secondOverview}
        selectedPeriodValue={baseOverview.selectedPeriodValue}
        onPeriodChange={fn()}
        onBreakdownAccountDoubleClick={fn()}
      />
    </>
  );
}

const meta = {
  title: "Routes/ReportGroupingSession",
  component: BookSwitchHarness,
  loaders: [
    () => {
      for (const [bookId, path] of [
        [firstBookId, "group:cash"],
        [secondBookId, "group:investments"],
      ]) {
        const state = getDefaultReportPageSessionState();
        state.drillPathsByGrouping.accountStructure.gainsLosses = [path];
        state.drillPathsByGrouping.assetClass.gainsLosses = [
          "asset-class:EQUITIES",
        ];
        sessionStorage.setItem(
          `cashfolio:reportPageState:${bookId}`,
          JSON.stringify(state),
        );
      }
      return {};
    },
  ],
} satisfies Meta<typeof BookSwitchHarness>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AccountBooksKeepIndependentPaths: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = within(
      canvas
        .getByRole("heading", { name: "Gains/Losses Breakdown" })
        .closest<HTMLElement>(".mantine-Card-root")!,
    );
    await expect(await card.findByText("Cash", { exact: true })).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Switch Account Book" }),
    );
    await expect(
      await card.findByText("Investments", { exact: true }),
    ).toBeVisible();
    await waitFor(() => {
      const stored = JSON.parse(
        sessionStorage.getItem(`cashfolio:reportPageState:${secondBookId}`)!,
      );
      expect(stored.drillPathsByGrouping.accountStructure.gainsLosses).toEqual([
        "group:investments",
      ]);
      expect(stored.drillPathsByGrouping.assetClass.gainsLosses).toEqual([
        "asset-class:EQUITIES",
      ]);
    });
    await userEvent.click(
      canvas.getByRole("button", { name: "Switch Account Book" }),
    );
    await expect(await card.findByText("Cash", { exact: true })).toBeVisible();
  },
};

const periodBookId = "grouping-period-ancestor";
const equities =
  baseOverview.accountBreakdownsByGrouping.assetClass.gainsLossesBreakdown.hierarchy.find(
    (node) => node.id === "asset-class:EQUITIES",
  )!;
const aapl = equities.children.find(
  (node) => node.id === "gain-loss-investment:EQUITIES:SECURITY:AAPL",
)!;
const msft = {
  ...aapl,
  id: "gain-loss-investment:EQUITIES:SECURITY:MSFT",
  label: "MSFT",
  children: aapl.children.map((node) => ({
    ...node,
    id: "gain-loss-account:msft",
    label: "MSFT Account",
    account: { ...node.account!, id: "msft", instrumentLabel: "MSFT / USD" },
  })),
};
function PeriodSwitchHarness() {
  const [period, setPeriod] = useState("2026-01");
  const base = deriveOverviewFromSelectedPeriodValue(period);
  const count = period === "2026-01" ? 2 : 1;
  const totals = {
    realizedGainLoss: aapl.realizedGainLoss * count,
    unrealizedGainLoss: aapl.unrealizedGainLoss * count,
    totalGainLoss: aapl.totalGainLoss * count,
  };
  const overview = {
    ...base,
    accountBreakdownsByGrouping: {
      ...base.accountBreakdownsByGrouping,
      assetClass: {
        ...base.accountBreakdownsByGrouping.assetClass,
        gainsLossesBreakdown: {
          ...totals,
          hierarchy: [
            {
              ...equities,
              ...totals,
              children: count === 2 ? [aapl, msft] : [msft],
            },
          ],
        },
      },
    },
  };
  return (
    <ReportPageView
      accountBookId={periodBookId}
      overview={overview}
      selectedPeriodValue={period}
      onPeriodChange={setPeriod}
      onBreakdownAccountDoubleClick={fn()}
    />
  );
}
export const PeriodChangesRetainSurvivingClass: Story = {
  render: () => <PeriodSwitchHarness />,
  loaders: [
    () => {
      const state = getDefaultReportPageSessionState();
      state.selectedGrouping = "assetClass";
      state.drillPathsByGrouping.assetClass.gainsLosses = [
        equities.id,
        aapl.id,
      ];
      sessionStorage.setItem(
        `cashfolio:reportPageState:${periodBookId}`,
        JSON.stringify(state),
      );
      return {};
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = within(
      canvas
        .getByRole("heading", { name: "Gains/Losses Breakdown" })
        .closest<HTMLElement>(".mantine-Card-root")!,
    );
    await waitFor(() =>
      expect(card.getByText("AAPL", { exact: true })).toBeVisible(),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Next Period" }));
    await waitFor(() => {
      expect(card.queryByText("AAPL", { exact: true })).not.toBeInTheDocument();
      expect(card.getByText("Equities", { exact: true })).toBeVisible();
      expect(
        card.getByRole("button", { name: "All Gains/Losses" }),
      ).toBeVisible();
      const stored = JSON.parse(
        sessionStorage.getItem(`cashfolio:reportPageState:${periodBookId}`)!,
      );
      expect(stored.drillPathsByGrouping.assetClass.gainsLosses).toEqual([
        equities.id,
      ]);
    });
    await userEvent.click(
      canvas.getByRole("button", { name: "Previous Period" }),
    );
    await waitFor(() => {
      expect(card.getByText("Equities", { exact: true })).toBeVisible();
      expect(
        card.getByRole("button", { name: "All Gains/Losses" }),
      ).toBeVisible();
      expect(
        JSON.parse(
          sessionStorage.getItem(`cashfolio:reportPageState:${periodBookId}`)!,
        ).drillPathsByGrouping.assetClass.gainsLosses,
      ).toEqual([equities.id]);
    });
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@mantine/core";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { ReportPageView } from "./-page-view";
import {
  baseOverview,
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

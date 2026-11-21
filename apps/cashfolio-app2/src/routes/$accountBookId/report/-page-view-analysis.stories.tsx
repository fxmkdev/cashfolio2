import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  STORYBOOK_ACCOUNT_BOOK_ID,
  baseOverview,
  withAccountBreakdowns,
} from "./-page-view.story-fixtures";
import { reportPageStoryMeta } from "./-page-view.story-meta";

const meta = { ...reportPageStoryMeta, title: "Screens/Report/Overview" };
export default meta;
type Story = StoryObj<typeof meta>;

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
  name: "Gains Losses Toggle Smoke Interaction Test",
  tags: ["regression", "!autodocs"],
};

export const GainsLossesDrillSmoke: Story = {
  args: {
    overview: withAccountBreakdowns({
      gainsLossesBreakdown: {
        hierarchy: [
          baseOverview.accountBreakdownsByGrouping.accountStructure
            .gainsLossesBreakdown.hierarchy[0]!,
        ],
      },
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const gainsLossesChart = await canvas.findByTestId(
      "period-gains-losses-breakdown-chart",
    );
    await expect(
      await canvas.findByText(
        /Top-level groups for gains\/losses in the selected period/,
      ),
    ).toBeInTheDocument();

    await userEvent.dblClick(gainsLossesChart);
    await waitFor(() => {
      expect(
        canvas.getByText(/Drilled gains\/losses in the selected period/),
      ).toBeInTheDocument();
    });
    await expect(canvas.getByText("Cash")).toBeInTheDocument();
  },
  name: "Gains Losses Drill Smoke Interaction Test",
  tags: ["regression", "!autodocs"],
};

export const SharedAccountGrouping: Story = {
  name: "Shared Account Grouping Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const selector = canvas.getByRole("combobox", {
      name: "Group Accounts By",
    });
    await expect(selector).toHaveValue("Account Structure");
    await userEvent.click(
      within(canvas.getByLabelText("Allocation Chart Type")).getByRole(
        "radio",
        { name: "Table" },
      ),
    );
    await userEvent.click(
      within(canvas.getByLabelText("Gains/Losses Chart Type")).getByRole(
        "radio",
        { name: "Table" },
      ),
    );
    const allocation = within(
      await canvas.findByTestId("period-allocation-breakdown-table"),
    );
    const gainsLosses = within(
      await canvas.findByTestId("period-gains-losses-breakdown-table"),
    );
    await expect(await allocation.findByText("Investments")).toBeVisible();
    await expect(await gainsLosses.findByText("Investments")).toBeVisible();
    await userEvent.click(selector);
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("option", {
        name: "Asset Class",
      }),
    );
    await expect(await allocation.findByText("Equities")).toBeVisible();
    await expect(await gainsLosses.findByText("Equities")).toBeVisible();
    await userEvent.click(selector);
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("option", {
        name: "Account Structure",
      }),
    );
    await expect(await allocation.findByText("Investments")).toBeVisible();
    await expect(await gainsLosses.findByText("Investments")).toBeVisible();
    const stored = JSON.parse(
      sessionStorage.getItem(
        `cashfolio:reportPageState:${STORYBOOK_ACCOUNT_BOOK_ID}`,
      )!,
    );
    await expect(stored.selectedGrouping).toBe("accountStructure");
    await expect(stored.selectedAllocationChartType).toBe("table");
    await expect(stored.selectedGainsLossesChartType).toBe("table");
  },
};

function singleGainLossGroup(grouping: "accountStructure" | "assetClass") {
  const breakdowns = baseOverview.accountBreakdownsByGrouping[grouping];
  const first = breakdowns.gainsLossesBreakdown.hierarchy[0];
  return {
    ...breakdowns,
    gainsLossesBreakdown: { ...first, hierarchy: [first] },
  };
}

export const GroupingDrillRestorationView: Story = {
  args: {
    overview: {
      ...baseOverview,
      accountBreakdownsByGrouping: {
        accountStructure: singleGainLossGroup("accountStructure"),
        assetClass: singleGainLossGroup("assetClass"),
      },
    },
  },
  name: "Grouping Drill Restoration Playground",
  tags: ["!regression"],
  play: undefined,
};

export const GroupingDrillRestoration: Story = {
  ...GroupingDrillRestorationView,
  name: "Grouping Drill Restoration Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const selector = canvas.getByRole("combobox", {
      name: "Group Accounts By",
    });
    const chart = await canvas.findByTestId(
      "period-gains-losses-breakdown-chart",
    );
    await userEvent.dblClick(chart);
    await expect(
      await canvas.findByText(
        "Drilled gains/losses in the selected period · Amounts shown in CHF",
      ),
    ).toBeVisible();
    await userEvent.click(selector);
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("option", {
        name: "Asset Class",
      }),
    );
    await expect(
      await canvas.findByText(
        "Top-level groups for gains/losses in the selected period · Amounts shown in CHF",
      ),
    ).toBeVisible();
    await userEvent.dblClick(chart);
    await expect(
      await canvas.findByText(
        "Drilled gains/losses in the selected period · Amounts shown in CHF",
      ),
    ).toBeVisible();
    await userEvent.click(selector);
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("option", {
        name: "Account Structure",
      }),
    );
    await expect(
      await canvas.findByText(
        "Drilled gains/losses in the selected period · Amounts shown in CHF",
      ),
    ).toBeVisible();
    const stored = JSON.parse(
      sessionStorage.getItem(
        `cashfolio:reportPageState:${STORYBOOK_ACCOUNT_BOOK_ID}`,
      )!,
    );
    await expect(
      stored.drillPathsByGrouping.accountStructure.gainsLosses,
    ).toEqual(["group:cash"]);
    await expect(stored.drillPathsByGrouping.assetClass.gainsLosses).toEqual([
      "asset-class:CASH_AND_CASH_EQUIVALENTS",
    ]);
  },
};

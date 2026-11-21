import type { StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { reportPageStoryMeta } from "./-page-view.story-meta";

const meta = { ...reportPageStoryMeta, title: "Screens/Report/Overview" };
export default meta;
type Story = StoryObj<typeof meta>;

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

    const cashFlowOption = await canvas.findByRole("radio", {
      name: "Cash Flow",
    });
    await userEvent.click(cashFlowOption);
    await expect(cashFlowOption).toBeChecked();
    await expect(
      canvas.getByRole("heading", { name: "Cash Flow Breakdown" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(
        "Top-level account groups included in cash flow in the selected period",
      ),
    ).toBeInTheDocument();
    await expect(
      within(breakdownChartTypeControl).queryByRole("radio", {
        name: "Donut",
      }),
    ).not.toBeInTheDocument();
    await expect(
      within(breakdownChartTypeControl).getByRole("radio", {
        name: "Bar",
      }),
    ).toBeChecked();
  },
  name: "Breakdown Toggle Smoke Interaction Test",
  tags: ["regression", "!autodocs"],
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
  name: "Breakdown Table Mode Smoke Interaction Test",
  tags: ["regression", "!autodocs"],
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
  name: "Breakdown Table Double Click Smoke Interaction Test",
  tags: ["regression", "!autodocs"],
};

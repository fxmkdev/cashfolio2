import type { StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import {
  baseOverview,
  withAccountBreakdowns,
} from "./-page-view.story-fixtures";
import { reportPageStoryMeta } from "./-page-view.story-meta";

const meta = { ...reportPageStoryMeta, title: "Screens/Report/Overview" };
export default meta;
type Story = StoryObj<typeof meta>;

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
    const allocationDonutOption = within(allocationChartTypeControl).getByRole(
      "radio",
      {
        name: "Donut",
      },
    );
    await userEvent.click(allocationDonutOption);
    await expect(allocationDonutOption).toBeChecked();
    await expect(
      within(allocationChartTypeControl).queryByRole("radio", { name: "Bar" }),
    ).not.toBeInTheDocument();
    await expect(
      within(allocationChartTypeControl).getByRole("radio", {
        name: "Table",
      }),
    ).toBeInTheDocument();
  },
  name: "Allocation Toggle Smoke Interaction Test",
  tags: ["regression", "!autodocs"],
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
  name: "Allocation Table Mode Smoke Interaction Test",
  tags: ["regression", "!autodocs"],
};

export const AllocationTableDoubleClickSmoke: Story = {
  args: {
    onBreakdownAccountDoubleClick: fn(),
    overview: withAccountBreakdowns({
      assetBreakdown: {
        ...baseOverview.accountBreakdownsByGrouping.accountStructure
          .assetBreakdown,
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
    }),
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
  name: "Allocation Table Double Click Smoke Interaction Test",
  tags: ["regression", "!autodocs"],
};

export const AllocationChartContainerDoubleClickSmoke: Story = {
  args: {
    onBreakdownAccountDoubleClick: fn(),
    overview: withAccountBreakdowns({
      assetBreakdown: {
        ...baseOverview.accountBreakdownsByGrouping.accountStructure
          .assetBreakdown,
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
    }),
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
  name: "Allocation Chart Container Double Click Smoke Interaction Test",
  tags: ["regression", "!autodocs"],
};

export const AllocationTableVirtualAccountDoubleClickIgnoredSmoke: Story = {
  args: {
    onBreakdownAccountDoubleClick: fn(),
    overview: withAccountBreakdowns({
      assetBreakdown: {
        ...baseOverview.accountBreakdownsByGrouping.accountStructure
          .assetBreakdown,
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
    }),
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
  name: "Allocation Table Virtual Account Double Click Ignored Smoke Interaction Test",
  tags: ["regression", "!autodocs"],
};

export const AllocationChartVirtualAccountDoubleClickIgnoredSmoke: Story = {
  args: {
    onBreakdownAccountDoubleClick: fn(),
    overview: withAccountBreakdowns({
      assetBreakdown: {
        ...baseOverview.accountBreakdownsByGrouping.accountStructure
          .assetBreakdown,
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
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    const allocationChart = await canvas.findByTestId(
      "period-allocation-breakdown-chart",
    );
    await userEvent.dblClick(allocationChart);

    await expect(args.onBreakdownAccountDoubleClick).not.toHaveBeenCalled();
  },
  name: "Allocation Chart Virtual Account Double Click Ignored Smoke Interaction Test",
  tags: ["regression", "!autodocs"],
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { HistoryViewSelect } from "./-view-select";
import { netWorthScopeOptions } from "./-story-fixtures";

const meta = {
  title: "Routes/HistoryViewSelect",
  component: HistoryViewSelect,
  args: {
    selectedMetric: "expenses",
    scopeSelection: {
      cashFlow: "total",
      income: "total",
      expenses: "total",
      gainsLosses: "total",
      netWorth: "total",
    },
    scopeOptions: {
      cashFlow: [],
      income: [],
      expenses: [
        {
          value: "account:groceries",
          label: "Household / Groceries",
          treeLabel: "Groceries",
          kind: "account",
        },
      ],
      gainsLosses: [],
      netWorth: [],
    },
    onViewChange: fn(),
  },
} satisfies Meta<typeof HistoryViewSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Searchable: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "View" });
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue("Expenses");
    await userEvent.click(input);
    await userEvent.clear(input);
    await userEvent.type(input, "Expenses / Household / Groceries");
    await userEvent.click(canvas.getByRole("option", { name: "Groceries" }));
    await expect(args.onViewChange).toHaveBeenCalledWith({
      metric: "expenses",
      scope: "account:groceries",
    });
  },
};

export const Pending: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "View" });
    await expect(input).toHaveValue("Expenses");
    await expect(input).toBeDisabled();
    await userEvent.click(input);
    await expect(canvas.queryByRole("listbox")).not.toBeInTheDocument();
    await expect(args.onViewChange).not.toHaveBeenCalled();
  },
};

export const NetWorthHierarchy: Story = {
  args: {
    selectedMetric: "netWorth",
    scopeSelection: {
      ...meta.args.scopeSelection,
      netWorth: "account:checking",
    },
    scopeOptions: { ...meta.args.scopeOptions, netWorth: netWorthScopeOptions },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "View" });
    await expect(input).toHaveValue("Checking");
    await userEvent.click(input);
    await userEvent.clear(input);
    await userEvent.type(input, "Net Worth / Banking / Credit Card");
    await userEvent.click(canvas.getByRole("option", { name: "Credit Card" }));
    await expect(args.onViewChange).toHaveBeenCalledWith({
      metric: "netWorth",
      scope: "account:card",
    });
    await userEvent.click(input);
    await userEvent.clear(input);
    await userEvent.type(input, "Net Worth");
    await userEvent.click(canvas.getByText("Net Worth", { exact: true }));
    await expect(args.onViewChange).toHaveBeenCalledWith({
      metric: "netWorth",
      scope: "total",
    });
  },
};

const gainLossArgs = {
  selectedMetric: "gainsLosses" as const,
  scopeOptions: {
    ...meta.args.scopeOptions,
    gainsLosses: [
      {
        value: "group:investments",
        label: "Investments",
        kind: "gainLoss",
        grouping: "accountStructure",
      },
      {
        value: "account:portfolio",
        label: "Investments / Portfolio",
        treeLabel: "Portfolio",
        kind: "gainLoss",
        grouping: "accountStructure",
        parentValue: "group:investments",
        accountId: "portfolio",
      },
      {
        value: "asset-class:EQUITIES",
        label: "Equities",
        kind: "gainLoss",
        grouping: "assetClass",
      },
      {
        value: "gain-loss-account:portfolio",
        label: "Equities / Portfolio",
        treeLabel: "Portfolio",
        kind: "gainLoss",
        grouping: "assetClass",
        parentValue: "asset-class:EQUITIES",
        accountId: "portfolio",
      },
    ],
  },
} satisfies Partial<Story["args"]>;

export const GainLossNavigationBranches: Story = {
  args: gainLossArgs,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "View" });
    await userEvent.click(input);
    const total = canvas
      .getByText("Gain/Loss", { exact: true })
      .closest<HTMLElement>('[role="option"]')!;
    await userEvent.click(
      within(total).getByRole("button", { name: "Expand" }),
    );
    await userEvent.click(
      canvas.getByText("By Account Structure", { exact: true }),
    );
    await expect(
      canvas.getByText("Investments", { exact: true }),
    ).toBeVisible();
    await expect(args.onViewChange).not.toHaveBeenCalled();
    await expect(input).toHaveValue("Gain/Loss");
    await userEvent.click(
      canvas.getByText("By Account Structure", { exact: true }),
    );
    await expect(
      canvas.queryByText("Investments", { exact: true }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByText("By Asset Class", { exact: true }));
    await expect(canvas.getByText("Equities", { exact: true })).toBeVisible();
    await expect(args.onViewChange).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByText("Equities", { exact: true }));
    await expect(args.onViewChange).toHaveBeenCalledWith({
      metric: "gainsLosses",
      scope: "asset-class:EQUITIES",
    });
    await userEvent.click(input);
    await userEvent.clear(input);
    await userEvent.type(
      input,
      "Gain/Loss / By Account Structure / Investments / Portfolio",
    );
    await userEvent.click(canvas.getByRole("option", { name: "Portfolio" }));
    await expect(args.onViewChange).toHaveBeenCalledWith({
      metric: "gainsLosses",
      scope: "account:portfolio",
    });
  },
};

export const GainLossKeyboardNavigation: Story = {
  args: gainLossArgs,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "View" });
    await userEvent.click(input);
    await userEvent.keyboard("{ArrowRight}{ArrowDown}{Enter}");
    await expect(
      canvas.getByText("Investments", { exact: true }),
    ).toBeVisible();
    await expect(args.onViewChange).not.toHaveBeenCalled();
    await expect(input).toHaveValue("Gain/Loss");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect(args.onViewChange).toHaveBeenCalledWith({
      metric: "gainsLosses",
      scope: "group:investments",
    });
  },
};

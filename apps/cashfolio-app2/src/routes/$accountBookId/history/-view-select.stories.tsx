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

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { HistoryViewSelect } from "./-view-select";

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
      assets: "total",
      liabilities: "total",
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
      assets: [],
      liabilities: [],
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

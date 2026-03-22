import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { SimpleTransactionModal } from "./simple-transaction-modal";
import { accountOptions } from "./storybook-fixtures";

const meta = {
  title: "Components/SimpleTransactionModal",
  component: SimpleTransactionModal,
  args: {
    currentAccount: {
      id: "account-checking",
      label: "Checking (CHF)",
    },
    accounts: accountOptions,
    onClose: fn(),
    onSubmit: fn(async () => undefined),
  },
} satisfies Meta<typeof SimpleTransactionModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ToggleDirectionAndSubmit: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByRole("textbox", { name: "Amount" }), "99");

    const counterAccountInput = canvas.getByRole("textbox", {
      name: "Counter account",
    });
    await userEvent.click(counterAccountInput);
    await userEvent.click(
      await canvas.findByRole("option", { name: "Credit Card (CHF)" }),
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Swap debit/credit direction" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Create" }));

    await expect(args.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ direction: "CREDIT" }),
    );
  },
};

export const ForcedDirectionDisablesToggle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const counterAccountInput = canvas.getByRole("textbox", {
      name: "Counter account",
    });
    await userEvent.click(counterAccountInput);
    await userEvent.click(
      await canvas.findByRole("option", { name: "Salary (Income)" }),
    );

    await expect(
      canvas.getByRole("button", { name: "Swap debit/credit direction" }),
    ).toBeDisabled();
  },
};

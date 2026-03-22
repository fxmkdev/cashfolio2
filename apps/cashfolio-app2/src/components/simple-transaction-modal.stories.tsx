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
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.type(body.getByRole("textbox", { name: "Amount" }), "99");

    const counterAccountInput = body.getByRole("textbox", {
      name: "Counter account",
    });
    await userEvent.click(counterAccountInput);
    await userEvent.click(
      await body.findByRole("option", { name: "Credit Card (CHF)" }),
    );

    await userEvent.click(
      body.getByRole("button", { name: "Swap debit/credit direction" }),
    );
    await userEvent.click(body.getByRole("button", { name: "Create" }));

    await expect(args.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ direction: "CREDIT" }),
    );
  },
};

export const ForcedDirectionDisablesToggle: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    const counterAccountInput = body.getByRole("textbox", {
      name: "Counter account",
    });
    await userEvent.click(counterAccountInput);
    await userEvent.click(
      await body.findByRole("option", { name: "Salary (Income)" }),
    );

    await expect(
      body.getByRole("button", { name: "Swap debit/credit direction" }),
    ).toBeDisabled();
  },
};

export const EditModeWithSwitchToSplit: Story = {
  args: {
    initialValues: {
      date: new Date("2026-01-15T00:00:00.000Z"),
      description: "Coffee",
      counterAccountId: "account-credit-card",
      amount: 5.5,
      direction: "CREDIT",
    },
    onSwitchToSplit: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);

    await expect(body.getByRole("button", { name: "Save" })).toBeVisible();
    await expect(
      body.getByRole("button", { name: "Switch to split editor" }),
    ).toBeVisible();

    await userEvent.click(
      body.getByRole("button", { name: "Switch to split editor" }),
    );

    await expect(args.onSwitchToSplit).toHaveBeenCalledWith(
      expect.objectContaining({
        counterAccountId: "account-credit-card",
        direction: "CREDIT",
      }),
    );
  },
};

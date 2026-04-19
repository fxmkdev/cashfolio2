import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mantine/core";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { EditTransactionModal } from "./edit-transaction-modal";
import {
  accountOptions,
  editTransactionInitialValues,
} from "./storybook-fixtures";

const meta = {
  title: "Components/EditTransactionModal",
  component: EditTransactionModal,
  decorators: [
    (Story) => (
      <Box maw={1200}>
        <Story />
      </Box>
    ),
  ],
  args: {
    accounts: accountOptions,
    openingBalancesBookingDate: new Date("2026-01-03T00:00:00.000Z"),
    currentAccountId: "account-checking",
    onClose: fn(),
    onSubmit: fn(async () => undefined),
  },
} satisfies Meta<typeof EditTransactionModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Create: Story = {};

export const Edit: Story = {
  args: {
    initialValues: editTransactionInitialValues,
  },
};

export const CancelInteraction: Story = {
  args: {
    initialValues: editTransactionInitialValues,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const CreateWithCustomSubmitLabel: Story = {
  args: {
    submitLabel: "Create",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("button", { name: "Create" })).toBeVisible();
  },
};

export const PendingSubmitDisablesActions: Story = {
  args: {
    initialValues: editTransactionInitialValues,
    onSubmit: fn(
      async () => await new Promise((resolve) => setTimeout(resolve, 150)),
    ),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const saveButton = canvas.getByRole("button", { name: "Save" });

    await userEvent.click(saveButton);
    await expect(saveButton).toBeDisabled();
    await expect(saveButton).toHaveAttribute("data-loading");

    await userEvent.click(saveButton);
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(saveButton).not.toBeDisabled());
    await expect(saveButton).not.toHaveAttribute("data-loading");
  },
};

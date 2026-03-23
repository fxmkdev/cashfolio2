import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { ConfirmDeleteModal } from "./confirm-delete-modal";

const meta = {
  component: ConfirmDeleteModal,
  title: "Components/ConfirmDeleteModal",
  args: {
    opened: true,
    title: "Delete account",
    name: "Savings",
    onClose: fn(),
    onConfirm: fn(),
  },
} satisfies Meta<typeof ConfirmDeleteModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Interactions: Story = {
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(body.getByRole("button", { name: "Cancel" }));
    await expect(args.onClose).toHaveBeenCalled();

    await userEvent.click(body.getByRole("button", { name: "Delete" }));
    await expect(args.onConfirm).toHaveBeenCalled();
  },
};

export const PendingConfirmDisablesActions: Story = {
  args: {
    onConfirm: fn(
      async () =>
        await new Promise<void>((resolve) => setTimeout(resolve, 150)),
    ),
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const confirmButton = body.getByRole("button", { name: "Delete" });
    const cancelButton = body.getByRole("button", { name: "Cancel" });

    await userEvent.click(confirmButton);
    await expect(confirmButton).toBeDisabled();
    await expect(confirmButton).toHaveAttribute("data-loading");
    await expect(cancelButton).toBeDisabled();

    await userEvent.click(confirmButton);
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(confirmButton).not.toBeDisabled());
    await expect(confirmButton).not.toHaveAttribute("data-loading");
    await expect(cancelButton).not.toBeDisabled();
  },
};

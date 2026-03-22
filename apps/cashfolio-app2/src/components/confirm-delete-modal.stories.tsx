import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
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
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await expect(args.onClose).toHaveBeenCalled();

    await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
    await expect(args.onConfirm).toHaveBeenCalled();
  },
};

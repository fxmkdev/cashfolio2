import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ConfirmArchiveModal } from "./confirm-archive-modal";

const meta = {
  component: ConfirmArchiveModal,
  title: "Components/ConfirmArchiveModal",
  args: {
    opened: true,
    title: "Archive account",
    name: "Credit Card",
    onClose: fn(),
    onConfirm: fn(),
  },
} satisfies Meta<typeof ConfirmArchiveModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Interactions: Story = {
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(body.getByRole("button", { name: "Cancel" }));
    await expect(args.onClose).toHaveBeenCalled();

    await userEvent.click(body.getByRole("button", { name: "Archive" }));
    await expect(args.onConfirm).toHaveBeenCalled();
  },
};

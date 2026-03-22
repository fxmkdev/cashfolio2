import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ReorderGroupChildrenModal } from "./reorder-group-children-modal";
import { reorderRows } from "./storybook-fixtures";

const meta = {
  title: "Components/ReorderGroupChildrenModal",
  component: ReorderGroupChildrenModal,
  args: {
    opened: true,
    rowName: "Assets",
    initialRows: reorderRows,
    onClose: fn(),
    onReorder: fn(async () => undefined),
  },
} satisfies Meta<typeof ReorderGroupChildrenModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CloseInteraction: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "Close" }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

import { pendingStorySubmission } from "../testing/pending-submission.story-helpers";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { ConfirmArchiveModal } from "./confirm-archive-modal";

const meta = {
  component: ConfirmArchiveModal,
  title: "Components/Confirmation Dialogs/Confirm Archive Modal",
  parameters: {
    docs: {
      story: { inline: false, iframeHeight: "640px" },
      description: {
        component:
          "Confirm archiving an account or category. opened controls visibility, name identifies the target, and onConfirm performs the mutation. Pending submissions disable dismissal and repeated confirmation.",
      },
    },
  },
  tags: ["autodocs"],
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

export const PendingConfirmDisablesActions: Story = {
  tags: ["regression", "!autodocs"],
  args: {
    onConfirm: fn(
      async () =>
        await new Promise<void>((resolve) => setTimeout(resolve, 150)),
    ),
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const confirmButton = body.getByRole("button", { name: "Archive" });
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

export const Pending: Story = {
  args: { ...{}, onConfirm: fn(pendingStorySubmission) },
  parameters: {
    docs: {
      story: { autoplay: true },
      description: {
        story:
          "The submission remains pending for inspection. Remount the story to reset it.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    const submit = body.getByRole("button", { name: "Archive" });
    await userEvent.click(submit);
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute("data-loading");
  },
};

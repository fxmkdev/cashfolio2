import {
  createPendingStorySubmitState,
  pendingStorySubmission,
} from "../testing/pending-submission.story-helpers";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { ConfirmDeleteModal } from "./confirm-delete-modal";

const meta = {
  component: ConfirmDeleteModal,
  title: "Components/Confirmation Dialogs/Confirm Delete Modal",
  parameters: {
    docs: {
      story: { inline: false, iframeHeight: "640px" },
      description: {
        component:
          "Confirm deleting a named entity. Supply opened, title, name, and onConfirm; description provides any additional consequences. Pending submissions disable cancellation and repeated confirmation.",
      },
    },
  },
  tags: ["autodocs"],
  args: {
    opened: true,
    title: "Delete Account",
    name: "Savings",
    onClose: fn(),
    onConfirm: fn(),
  },
} satisfies Meta<typeof ConfirmDeleteModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Interactions: Story = {
  ...Default,
  name: "Confirm And Cancel Interaction Test",
  tags: ["regression", "!autodocs"],
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
  name: "Pending Confirm Disables Actions Interaction Test",
  tags: ["regression", "!autodocs"],
};

export const PendingState: Story = {
  args: {
    ...{},
    onConfirm: fn(pendingStorySubmission),
    submitState: createPendingStorySubmitState(),
  },
  parameters: {
    docs: {
      story: { autoplay: false },
      description: {
        story:
          "Pending is supplied directly through submitState. No submission runs on mount; controls are intentionally disabled.",
      },
    },
  },
  name: "Pending",
  tags: ["!regression"],
  play: undefined,
};

export const Pending: Story = {
  ...PendingState,
  args: { ...PendingState.args, submitState: undefined },
  name: "Pending Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    const submit = body.getByRole("button", { name: "Delete" });
    await userEvent.click(submit);
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute("data-loading");
  },
};

import { pendingStorySubmission } from "../testing/pending-submission.story-helpers";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { RebookBookingModal } from "./rebook-booking-modal";

const targetAccounts = [
  { value: "account-savings", label: "Savings (CHF)" },
  { value: "account-cash", label: "Cash (CHF)" },
];

const meta = {
  title: "Components/Transaction Editors and Actions/Rebook Booking Modal",
  parameters: {
    docs: {
      story: { inline: false, iframeHeight: "640px" },
      description: {
        component:
          "Move bookings to an eligible account/category. targetAccounts contains valid destinations; disabledReason explains when none are eligible. onSubmit receives the chosen target account ID.",
      },
    },
  },
  tags: ["autodocs"],
  component: RebookBookingModal,
  args: {
    targetAccounts,
    onClose: fn(),
    onSubmit: fn(async () => undefined),
  },
} satisfies Meta<typeof RebookBookingModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Account or Category")).toHaveValue("");
  },
};

export const NoEligibleTarget: Story = {
  args: {
    targetAccounts: [],
    disabledReason: "No eligible target account is available.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Rebook" })).toBeDisabled();
  },
};

export const SubmitAndCancel: Story = {
  ...Default,
  name: "Submit And Cancel Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const targetAccountInput = canvas.getByLabelText("Account or Category");

    await userEvent.click(targetAccountInput);
    await userEvent.click(await body.findByText("Savings (CHF)"));
    await expect(targetAccountInput).toHaveValue("Savings (CHF)");
    await userEvent.type(targetAccountInput, "{enter}");
    await expect(args.onSubmit).toHaveBeenCalledWith({
      targetAccountId: "account-savings",
    });

    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const EnterSubmitPendingGuard: Story = {
  args: {
    onSubmit: fn(
      async () => await new Promise((resolve) => setTimeout(resolve, 150)),
    ),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const targetAccountInput = canvas.getByLabelText("Account or Category");

    await userEvent.click(targetAccountInput);
    await userEvent.click(await body.findByText("Savings (CHF)"));
    await userEvent.type(targetAccountInput, "{enter}{enter}");

    const submitButton = canvas.getByRole("button", { name: "Rebook" });
    await expect(submitButton).toBeDisabled();
    await expect(submitButton).toHaveAttribute("data-loading");
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(submitButton).not.toBeDisabled());
    await expect(submitButton).not.toHaveAttribute("data-loading");
  },
  name: "Enter Submit Pending Guard Interaction Test",
  tags: ["regression", "!autodocs"],
};

export const PendingAfterSubmit: Story = {
  args: { ...{}, onSubmit: fn(pendingStorySubmission) },
  parameters: {
    manualSetup:
      "Select Savings (CHF) in Account or Category, then click Rebook. The submission remains pending until you remount the story.",
    docs: {
      story: { autoplay: false },
      description: {
        story:
          "Select Savings (CHF) in Account or Category, then click Rebook. The submission remains pending until you remount the story.",
      },
    },
  },
  name: "Pending After Submit",
  tags: ["!regression"],
  play: undefined,
};

export const Pending: Story = {
  ...PendingAfterSubmit,
  name: "Pending Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByLabelText("Account or Category"));
    await userEvent.click(await body.findByText("Savings (CHF)"));
    const submit = body.getByRole("button", { name: "Rebook" });
    await userEvent.click(submit);
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute("data-loading");
  },
};

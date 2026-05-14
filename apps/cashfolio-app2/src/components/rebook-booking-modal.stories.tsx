import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { RebookBookingModal } from "./rebook-booking-modal";

const targetAccounts = [
  { value: "account-savings", label: "Savings (CHF)" },
  { value: "account-cash", label: "Cash (CHF)" },
];

const meta = {
  title: "Components/RebookBookingModal",
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
    await expect(
      canvas.getByRole("combobox", { name: "Target account" }),
    ).toHaveValue("");
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
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const targetAccountInput = canvas.getByRole("combobox", {
      name: "Target account",
    });

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
    const targetAccountInput = canvas.getByRole("combobox", {
      name: "Target account",
    });

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
};

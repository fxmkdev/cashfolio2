import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
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

export const Default: Story = {};

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

    await userEvent.click(canvas.getByRole("button", { name: "Rebook" }));
    await expect(args.onSubmit).toHaveBeenCalledWith({
      targetAccountId: "account-savings",
    });

    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

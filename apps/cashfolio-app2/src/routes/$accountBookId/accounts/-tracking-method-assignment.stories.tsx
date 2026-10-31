import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { TrackingMethodAssignmentDialog } from "./-tracking-method-assignment";

const meta = {
  title: "Routes/Accounts/TrackingMethodAssignmentDialog",
  component: TrackingMethodAssignmentDialog,
  args: {
    target: {
      accountIds: ["first", "second"],
      archivedCount: 1,
      skippedCount: 1,
    },
    onClose: fn(),
    onSubmit: fn(async (): Promise<void> => undefined),
  },
} satisfies Meta<typeof TrackingMethodAssignmentDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SubmissionGuards: Story = {
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Set Tracking Method" }),
    );
    let finish: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    args.onSubmit.mockImplementationOnce(() => pending);
    await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
    await userEvent.click(dialog.getByLabelText("Tracking Method"));
    await userEvent.click(
      body.getByRole("option", { name: "Total Portfolio Value" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    try {
      await expect(
        dialog.getByRole("button", { name: "Cancel" }),
      ).toBeDisabled();
      await expect(dialog.getByLabelText("Tracking Method")).toBeDisabled();
      await userEvent.keyboard("{Enter}{Escape}");
      await expect(args.onSubmit).toHaveBeenCalledTimes(1);
      await expect(args.onSubmit).toHaveBeenCalledWith("TOTAL_PORTFOLIO_VALUE");
      await expect(args.onClose).not.toHaveBeenCalled();
      await expect(
        body.getByRole("dialog", { name: "Set Tracking Method" }),
      ).toBeVisible();
    } finally {
      finish();
    }
    await waitFor(() =>
      expect(dialog.getByRole("button", { name: "Cancel" })).toBeEnabled(),
    );
  },
};

export const CancelBeforeChoosing: Story = {
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Set Tracking Method" }),
    );
    await expect(body.queryByRole("option")).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await expect(args.onClose).toHaveBeenCalledTimes(1);
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

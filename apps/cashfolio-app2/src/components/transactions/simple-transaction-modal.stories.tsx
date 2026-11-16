import { pendingStorySubmission } from "../testing/pending-submission.story-helpers";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { SimpleTransactionModal } from "./simple-transaction-modal";
import { accountOptions } from "../testing/storybook-fixtures";
import { RESOURCE_LIMITS } from "../../shared/resources/resource-limits";

const meta = {
  title: "Components/Transaction Editors and Actions/Simple Transaction Modal",
  parameters: {
    docs: {
      story: { inline: false, iframeHeight: "640px" },
      description: {
        component:
          "Single-counterparty transaction entry. Supply currentAccount, accounts, and the book start date. initialValues selects editing; onSwitchToSplit forwards the draft to the split editor when provided.",
      },
    },
  },
  tags: ["autodocs"],
  component: SimpleTransactionModal,
  args: {
    currentAccount: {
      id: "account-checking",
      label: "Checking (CHF)",
    },
    accounts: accountOptions,
    accountBookStartDate: new Date("2026-01-04T00:00:00.000Z"),
    onClose: fn(),
    onSubmit: fn(async () => undefined),
  },
} satisfies Meta<typeof SimpleTransactionModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ToggleDirectionAndSubmit: Story = {
  ...Default,
  name: "Toggle Direction And Submit Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.type(body.getByRole("textbox", { name: "Amount" }), "99");

    const counterAccountInput = body.getByLabelText("Account or Category");
    await userEvent.click(counterAccountInput);
    await userEvent.click(await body.findByText("Credit Card (CHF)"));

    await userEvent.click(
      body.getByRole("button", { name: "Swap Debit/Credit Direction" }),
    );
    await userEvent.click(body.getByRole("button", { name: "Create" }));

    await expect(args.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ direction: "CREDIT" }),
    );
  },
};

export const ForcedDirectionDisablesToggle: Story = {
  ...Default,
  name: "Forced Direction Disables Toggle Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    const counterAccountInput = body.getByLabelText("Account or Category");
    await userEvent.click(counterAccountInput);
    await userEvent.click(await body.findByText("Salary (Income)"));

    await expect(
      body.getByRole("button", { name: "Swap Debit/Credit Direction" }),
    ).toBeDisabled();
  },
};

export const EditModeWithSwitchToSplitView: Story = {
  args: {
    initialValues: {
      date: new Date("2026-01-15T00:00:00.000Z"),
      description: "Coffee",
      counterAccountId: "account-credit-card",
      amount: 5.5,
      direction: "CREDIT",
    },
    onSwitchToSplit: fn(),
  },
  name: "Edit Mode With Switch To Split Playground",
  tags: ["!regression"],
  play: undefined,
};

export const EditModeWithSwitchToSplit: Story = {
  ...EditModeWithSwitchToSplitView,
  name: "Edit Mode With Switch To Split Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);

    await expect(body.getByRole("button", { name: "Save" })).toBeVisible();
    await expect(
      body.getByRole("button", { name: "Switch to Split Editor" }),
    ).toBeVisible();

    await userEvent.click(
      body.getByRole("button", { name: "Switch to Split Editor" }),
    );

    await expect(args.onSwitchToSplit).toHaveBeenCalledWith(
      expect.objectContaining({
        counterAccountId: "account-credit-card",
        direction: "CREDIT",
      }),
    );
  },
};

export const EnterSubmitPendingGuard: Story = {
  args: {
    onSubmit: fn(
      async () => await new Promise((resolve) => setTimeout(resolve, 150)),
    ),
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.type(body.getByRole("textbox", { name: "Amount" }), "99");

    const counterAccountInput = body.getByLabelText("Account or Category");
    await userEvent.click(counterAccountInput);
    await userEvent.click(await body.findByText("Credit Card (CHF)"));

    const descriptionInput = body.getByRole("textbox", { name: "Description" });
    await userEvent.type(descriptionInput, "{enter}{enter}");

    const submitButton = body.getByRole("button", { name: "Create" });
    await expect(submitButton).toBeDisabled();
    await expect(submitButton).toHaveAttribute("data-loading");
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(submitButton).not.toBeDisabled());
    await expect(submitButton).not.toHaveAttribute("data-loading");
  },
  name: "Enter Submit Pending Guard Interaction Test",
  tags: ["regression", "!autodocs"],
};

export const DescriptionLimitPreservesDraft: Story = {
  args: {
    initialValues: {
      date: new Date("2026-01-15T00:00:00.000Z"),
      description: "x".repeat(RESOURCE_LIMITS.description + 1),
      counterAccountId: "account-credit-card",
      amount: 5.5,
      direction: "CREDIT",
    },
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const description = body.getByRole("textbox", { name: "Description" });

    await userEvent.click(body.getByRole("button", { name: "Save" }));

    await expect(
      body.getByText("Description cannot exceed 4’000 characters."),
    ).toBeVisible();
    await expect(args.onSubmit).not.toHaveBeenCalled();
    await expect(description).toHaveValue(args.initialValues!.description);

    await userEvent.click(description);
    await userEvent.keyboard("{End}{Backspace}");
    await userEvent.click(body.getByRole("button", { name: "Save" }));

    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
    await expect(args.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "x".repeat(RESOURCE_LIMITS.description),
      }),
    );
  },
  name: "Description Limit Preserves Draft Interaction Test",
  tags: ["regression", "!autodocs"],
};

export const PendingAfterSubmit: Story = {
  args: {
    ...EditModeWithSwitchToSplit.args,
    onSubmit: fn(pendingStorySubmission),
  },
  parameters: {
    manualSetup:
      "Click Save to keep this prefilled transaction pending. Remount the story to reset it.",
    docs: {
      story: { autoplay: false },
      description: {
        story:
          "Click Save to keep this prefilled transaction pending. Remount the story to reset it.",
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

    const submit = body.getByRole("button", { name: "Save" });
    await userEvent.click(submit);
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute("data-loading");
  },
};

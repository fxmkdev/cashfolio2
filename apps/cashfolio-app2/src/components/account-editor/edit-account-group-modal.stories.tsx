import { pendingStorySubmission } from "../testing/pending-submission.story-helpers";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { EditAccountGroupModal } from "./edit-account-group-modal";
import {
  accountGroupOptions,
  editAccountGroupInitialValues,
  existingNodes,
} from "../testing/storybook-fixtures";

const meta = {
  title: "Components/Account Editors/Edit Account Group Modal",
  parameters: {
    docs: {
      story: { inline: false, iframeHeight: "640px" },
      description: {
        component:
          "Create or edit an account/category group. typeDescriptor determines the labels and allowed parent groups. Use initialValues and editingId for editing; onSubmit owns persistence.",
      },
    },
  },
  tags: ["autodocs"],
  component: EditAccountGroupModal,
  args: {
    opened: true,
    accountGroups: accountGroupOptions,
    typeDescriptor: "BALANCE",
    existingNodes,
    onClose: fn(),
    onSubmit: fn(async () => undefined),
    onExitTransitionEnd: fn(),
  },
} satisfies Meta<typeof EditAccountGroupModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Create: Story = {};

export const ExpenseCategoryGroup: Story = {
  args: {
    typeDescriptor: "EQUITY-EXPENSE",
    accountGroups: [],
    existingNodes: [],
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      body.getByRole("dialog", { name: "New Category Group" }),
    ).toBeInTheDocument();
    await expect(body.getByPlaceholderText("e.g. Housing")).toBeInTheDocument();
    await expect(
      body.getByLabelText("Parent Category Group"),
    ).toBeInTheDocument();
  },
};

export const Edit: Story = {
  args: {
    initialValues: editAccountGroupInitialValues,
    editingId: "group-cash",
  },
};

export const ValidationSmoke: Story = {
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(body.getByRole("button", { name: "Create" }));
    await expect(body.getByText("Name is required")).toBeInTheDocument();
  },
};

export const PendingSubmitDisablesActions: Story = {
  tags: ["regression", "!autodocs"],
  args: {
    initialValues: editAccountGroupInitialValues,
    editingId: "group-cash",
    onSubmit: fn(
      async () => await new Promise((resolve) => setTimeout(resolve, 150)),
    ),
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const saveButton = body.getByRole("button", { name: "Save" });

    await userEvent.click(saveButton);
    await expect(saveButton).toBeDisabled();
    await expect(saveButton).toHaveAttribute("data-loading");

    await userEvent.click(saveButton);
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(saveButton).not.toBeDisabled());
    await expect(saveButton).not.toHaveAttribute("data-loading");
  },
};

export const Pending: Story = {
  args: { ...Edit.args, onSubmit: fn(pendingStorySubmission) },
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

    const submit = body.getByRole("button", { name: "Save" });
    await userEvent.click(submit);
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute("data-loading");
  },
};

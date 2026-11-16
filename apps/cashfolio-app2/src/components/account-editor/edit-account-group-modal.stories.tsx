import {
  createPendingStorySubmitState,
  pendingStorySubmission,
} from "../testing/pending-submission.story-helpers";
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
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(body.getByRole("button", { name: "Create" }));
    await expect(body.getByText("Name is required")).toBeInTheDocument();
  },
  name: "Validation Smoke Interaction Test",
  tags: ["regression", "!autodocs"],
};

export const PendingSubmitDisablesActions: Story = {
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
  name: "Pending Submit Disables Actions Interaction Test",
  tags: ["regression", "!autodocs"],
};

export const PendingState: Story = {
  args: {
    ...Edit.args,
    onSubmit: fn(pendingStorySubmission),
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

    const submit = body.getByRole("button", { name: "Save" });
    await userEvent.click(submit);
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute("data-loading");
  },
};

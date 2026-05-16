import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { EditAccountModal } from "./edit-account-modal";
import {
  accountGroupOptions,
  editAccountInitialValues,
  existingNodes,
} from "./storybook-fixtures";

const meta = {
  title: "Components/EditAccountModal",
  component: EditAccountModal,
  args: {
    opened: true,
    accountGroups: accountGroupOptions,
    typeDescriptor: "ASSET",
    existingNodes,
    onClose: fn(),
    onSubmit: fn(async () => undefined),
    onExitTransitionEnd: fn(),
  },
} satisfies Meta<typeof EditAccountModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Create: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await expect(body.getByLabelText("Unit")).not.toBeDisabled();
    await expect(body.getByLabelText("Currency")).not.toBeDisabled();
  },
};

export const Edit: Story = {
  args: {
    initialValues: editAccountInitialValues,
    editingId: "account-checking",
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await expect(body.getByLabelText("Unit")).toBeDisabled();
    await expect(body.getByLabelText("Currency")).toBeDisabled();
  },
};

export const ValidationSmoke: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(body.getByRole("button", { name: "Create" }));
    await expect(body.getByText("Name is required")).toBeInTheDocument();
  },
};

export const PendingSubmitDisablesActions: Story = {
  args: {
    initialValues: editAccountInitialValues,
    editingId: "account-checking",
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

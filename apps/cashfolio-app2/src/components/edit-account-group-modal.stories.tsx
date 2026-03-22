import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { EditAccountGroupModal } from "./edit-account-group-modal";
import {
  accountGroupOptions,
  editAccountGroupInitialValues,
  existingNodes,
} from "./storybook-fixtures";

const meta = {
  title: "Components/EditAccountGroupModal",
  component: EditAccountGroupModal,
  args: {
    opened: true,
    accountGroups: accountGroupOptions,
    typeDescriptor: "ASSET",
    existingNodes,
    onClose: fn(),
    onSubmit: fn(async () => undefined),
    onExitTransitionEnd: fn(),
  },
} satisfies Meta<typeof EditAccountGroupModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Create: Story = {};

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
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
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

export const Create: Story = {};

export const Edit: Story = {
  args: {
    initialValues: editAccountInitialValues,
    editingId: "account-checking",
  },
};

export const ValidationSmoke: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(body.getByRole("button", { name: "Create" }));
    await expect(body.getByText("Name is required")).toBeInTheDocument();
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { EditAccountModal } from "./edit-account-modal";
import {
  accountGroupOptions,
  editAccountInitialValues,
  existingNodes,
} from "../testing/storybook-fixtures";

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

function getFieldControl(dialog: HTMLElement, label: string) {
  const labelElement = within(dialog).getByText(label, {
    selector: ".mantine-InputWrapper-label",
  });
  const wrapper = labelElement.closest(".mantine-InputWrapper-root");
  const control = wrapper?.querySelector("input, button");

  if (!(control instanceof HTMLElement)) {
    throw new Error(`Could not find control for ${label}`);
  }

  return control;
}

export const Create: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", { name: "New Account" });

    await waitFor(() => expect(dialog).toBeVisible());
    await waitFor(() => expect(getFieldControl(dialog, "Unit")).toBeVisible());
    await expect(getFieldControl(dialog, "Unit")).not.toBeDisabled();
    await expect(getFieldControl(dialog, "Currency")).not.toBeDisabled();
  },
};

export const IncomeCategory: Story = {
  args: {
    typeDescriptor: "EQUITY-INCOME",
    accountGroups: [],
    existingNodes: [],
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      body.getByRole("dialog", { name: "New Category" }),
    ).toBeInTheDocument();
    await expect(body.getByPlaceholderText("e.g. Salary")).toBeInTheDocument();
    await expect(
      body.queryByLabelText("Opening Balance"),
    ).not.toBeInTheDocument();
  },
};

export const Edit: Story = {
  args: {
    initialValues: editAccountInitialValues,
    editingId: "account-checking",
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", { name: "Edit Account" });

    await waitFor(() => expect(dialog).toBeVisible());
    await waitFor(() => expect(getFieldControl(dialog, "Unit")).toBeVisible());
    await expect(getFieldControl(dialog, "Unit")).toBeDisabled();
    await expect(getFieldControl(dialog, "Currency")).toBeDisabled();
  },
};

export const LiabilityOpeningDebt: Story = {
  args: {
    initialValues: {
      ...editAccountInitialValues,
      name: "Credit Card",
      type: "LIABILITY",
      openingBalance: -100,
      groupId: undefined,
      isCashAccount: false,
    },
    typeDescriptor: "LIABILITY",
    editingId: "account-card",
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", { name: "Edit Account" });
    const balance = within(dialog).getByLabelText("Opening Balance");
    await expect(balance).toHaveValue("-100");
    await expect(balance).toHaveAccessibleDescription(
      "Use positive amounts for balances you own and negative amounts for balances you owe.",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "LIABILITY", openingBalance: -100 }),
      ),
    );
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
    // Keep submission pending through both clicks, even under coverage overhead.
    let finishSubmit = () => {};
    const pendingSubmit = new Promise<undefined>((resolve) => {
      finishSubmit = () => resolve(undefined);
    });
    args.onSubmit.mockImplementationOnce(() => pendingSubmit);

    const body = within(canvasElement.ownerDocument.body);
    const saveButton = body.getByRole("button", { name: "Save" });

    await userEvent.click(saveButton);
    await expect(saveButton).toBeDisabled();
    await expect(saveButton).toHaveAttribute("data-loading");

    await userEvent.click(saveButton);
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);

    finishSubmit();
    await waitFor(() => expect(saveButton).not.toBeDisabled());
    await expect(saveButton).not.toHaveAttribute("data-loading");
  },
};

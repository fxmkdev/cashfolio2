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
    typeDescriptor: "BALANCE",
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
    await expect(
      within(dialog).getByRole("button", { name: "Statement Import Settings" }),
    ).toHaveAttribute("aria-expanded", "false");
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

export const ManagedPortfolio: Story = {
  args: {
    initialValues: {
      ...editAccountInitialValues,
      name: "Managed Portfolio",
      groupId: undefined,
      trackingMethod: "TOTAL_PORTFOLIO_VALUE",
    },
    editingId: "portfolio",
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", { name: "Edit Account" });
    const tracking = getFieldControl(dialog, "Tracking Method");
    await expect(tracking).toHaveValue("Total Portfolio Value");
    await expect(tracking).not.toBeDisabled();
    await userEvent.click(tracking);
    await userEvent.click(
      await body.findByRole("option", { name: "Individual Units" }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ trackingMethod: "INDIVIDUAL_UNITS" }),
      ),
    );
  },
};

export const LiabilityOpeningDebt: Story = {
  args: {
    initialValues: {
      ...editAccountInitialValues,
      name: "Credit Card",
      type: "BALANCE",
      openingBalance: -100,
      groupId: undefined,
      isCashAccount: false,
    },
    typeDescriptor: "BALANCE",
    editingId: "account-card",
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", { name: "Edit Account" });
    const balance = within(dialog).getByLabelText("Opening Balance");
    await expect(balance).toHaveValue("-100");
    await expect(balance).toHaveAccessibleDescription(
      "Positive for balances you own; negative for amounts you owe.",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "BALANCE", openingBalance: -100 }),
      ),
    );
  },
};

export const StatementImportSettings: Story = {
  args: {
    initialValues: {
      ...editAccountInitialValues,
      statementImportCsvFormat: {
        hasHeader: true,
        delimitersToGuess: [","],
        columns: ["date", "amount", "description"],
      },
    },
    editingId: "account-checking",
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", { name: "Edit Account" });
    const settings = within(dialog).getByRole("button", {
      name: "Statement Import Settings",
    });
    const format = within(dialog).getByLabelText("Statement Import CSV Format");

    await expect(settings).toHaveAttribute("aria-expanded", "false");
    await expect(format).not.toBeVisible();
    await userEvent.click(settings);
    await waitFor(() => expect(format).toBeVisible());
    await expect(format).toHaveValue(
      JSON.stringify(args.initialValues?.statementImportCsvFormat, null, 2),
    );

    const updatedFormat = {
      hasHeader: false,
      delimitersToGuess: [";"],
      columns: ["date", "amount", "description"],
    };
    await userEvent.clear(format);
    await userEvent.paste(JSON.stringify(updatedFormat));
    await userEvent.click(settings);
    await waitFor(() => expect(format).not.toBeVisible());
    await userEvent.click(settings);
    await waitFor(() => expect(format).toBeVisible());
    await expect(format).toHaveValue(JSON.stringify(updatedFormat));
    await userEvent.click(settings);
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ statementImportCsvFormat: updatedFormat }),
      ),
    );
  },
};

export const CollapsedStatementImportError: Story = {
  args: {
    initialValues: editAccountInitialValues,
    editingId: "account-checking",
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", { name: "Edit Account" });
    const settings = within(dialog).getByRole("button", {
      name: "Statement Import Settings",
    });
    const format = within(dialog).getByLabelText("Statement Import CSV Format");

    await userEvent.click(settings);
    await waitFor(() => expect(format).toBeVisible());
    await userEvent.click(format);
    await userEvent.paste("invalid JSON");
    await userEvent.click(settings);
    await waitFor(() => expect(format).not.toBeVisible());
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(settings).toHaveAttribute("aria-expanded", "true"),
    );
    await waitFor(() => expect(format).toBeVisible());
    await expect(format).toHaveAttribute("aria-invalid", "true");
    await expect(args.onSubmit).not.toHaveBeenCalled();
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

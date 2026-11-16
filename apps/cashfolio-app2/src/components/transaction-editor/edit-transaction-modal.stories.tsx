import { pendingStorySubmission } from "../testing/pending-submission.story-helpers";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mantine/core";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { EditTransactionModal } from "./edit-transaction-modal";
import { Unit } from "../../.prisma-client/enums";
import {
  accountOptions,
  editTransactionInitialValues,
} from "../testing/storybook-fixtures";

const meta = {
  title: "Components/Transaction Editors and Actions/Edit Transaction Modal",
  parameters: {
    docs: {
      story: { inline: false, iframeHeight: "640px" },
      description: {
        component:
          "Split transaction editor with a bookings grid. Supply accounts, currentAccountId, and the book start date. initialValues selects edit mode; onSubmit saves the draft and onRefreshConstraints supports recovery.",
      },
    },
  },
  tags: ["autodocs"],
  component: EditTransactionModal,
  decorators: [
    (Story) => (
      <Box maw={1200}>
        <Story />
      </Box>
    ),
  ],
  args: {
    accounts: accountOptions,
    accountBookStartDate: new Date("2026-01-04T00:00:00.000Z"),
    currentAccountId: "account-checking",
    onClose: fn(),
    onSubmit: fn(async () => undefined),
  },
} satisfies Meta<typeof EditTransactionModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Create: Story = {};

export const Edit: Story = {
  args: {
    initialValues: editTransactionInitialValues,
  },
};

const editCategoryUnitAndCurrency: Story["play"] = async ({
  canvasElement,
  args,
}) => {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await canvas.findByText("Groceries (Expense)");

  function categoryCell(column: string): HTMLElement {
    const row = canvas.getByText("Groceries (Expense)").closest(".ag-row");
    const cell = row?.querySelector<HTMLElement>(`[col-id="${column}"]`);
    if (!cell) throw new Error(`Missing category ${column} cell`);
    return cell;
  }

  async function selectCellOption(column: string, label: string) {
    const cell = categoryCell(column);
    await userEvent.click(cell);
    const input = await within(cell).findByRole("combobox");
    await userEvent.click(input);
    await userEvent.click(await body.findByRole("option", { name: label }));
    await userEvent.click(categoryCell("description"));
    await waitFor(() => expect(categoryCell(column)).toHaveTextContent(label));
  }

  await selectCellOption("unit", "Crypto");
  await selectCellOption("unit", "Currency");
  await selectCellOption("ccy", "EUR");
  await userEvent.click(
    canvas.getByRole("button", { name: args.submitLabel ?? "Save" }),
  );
  await waitFor(() =>
    expect(args.onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        bookings: expect.arrayContaining([
          expect.objectContaining({
            accountId: "account-groceries",
            unit: Unit.CURRENCY,
            currency: "EUR",
            value: 84.5,
          }),
          expect.objectContaining({
            accountId: "account-checking",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -84.5,
          }),
        ]),
      }),
    ),
  );
};

export const CategoryUnitAndCurrencyEditing: Story = {
  args: { initialValues: editTransactionInitialValues },
  play: editCategoryUnitAndCurrency,
};

export const ImportedCategoryUnitAndCurrencyEditing: Story = {
  args: {
    initialValues: editTransactionInitialValues,
    submitLabel: "Save Draft",
  },
  play: editCategoryUnitAndCurrency,
};

export const CancelInteraction: Story = {
  args: {
    initialValues: editTransactionInitialValues,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const CreateWithCustomSubmitLabel: Story = {
  args: {
    submitLabel: "Create",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("button", { name: "Create" })).toBeVisible();
  },
};

export const PendingSubmitDisablesActions: Story = {
  tags: ["regression", "!autodocs"],
  args: {
    initialValues: editTransactionInitialValues,
    onSubmit: fn(
      async () => await new Promise((resolve) => setTimeout(resolve, 150)),
    ),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const saveButton = canvas.getByRole("button", { name: "Save" });

    await userEvent.click(saveButton);
    await expect(saveButton).toBeDisabled();
    await expect(saveButton).toHaveAttribute("data-loading");

    await userEvent.click(saveButton);
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(saveButton).not.toBeDisabled());
    await expect(saveButton).not.toHaveAttribute("data-loading");
  },
};

export const SubmitCommitsActiveCell: Story = {
  tags: ["regression", "!autodocs"],
  args: { initialValues: editTransactionInitialValues, onDirtyChange: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const row = (await canvas.findByText("Groceries (Expense)")).closest(
      ".ag-row",
    );
    const cell = row?.querySelector<HTMLElement>('[col-id="description"]');
    if (!cell) throw new Error("Missing booking description cell");
    await userEvent.click(cell);
    const input = await within(cell).findByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Pending booking note");
    await waitFor(() =>
      expect(args.onDirtyChange).toHaveBeenLastCalledWith(true),
    );
    await expect(args.onSubmit).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          bookings: expect.arrayContaining([
            expect.objectContaining({
              accountId: "account-groceries",
              description: "Pending booking note",
            }),
          ]),
        }),
      ),
    );
  },
};

export const ProvisionalDateDirtyState: Story = {
  tags: ["regression", "!autodocs"],
  args: { onDirtyChange: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(args.onDirtyChange).toHaveBeenLastCalledWith(false),
    );
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Date" }),
      "invalid",
    );
    await waitFor(() =>
      expect(args.onDirtyChange).toHaveBeenLastCalledWith(true),
    );
    await userEvent.tab();
    await waitFor(() =>
      expect(args.onDirtyChange).toHaveBeenLastCalledWith(false),
    );
  },
};

export const FailedSubmitRetainsDraft: Story = {
  tags: ["regression", "!autodocs"],
  args: {
    initialValues: editTransactionInitialValues,
    onSubmit: fn(async () => {
      throw new Error("Draft could not be saved.");
    }),
    onRefreshConstraints: fn(async () => undefined),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const description = canvas.getByRole("textbox", { name: "Description" });
    await userEvent.clear(description);
    await userEvent.type(description, "Retained draft");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Draft could not be saved.",
    );
    await waitFor(() =>
      expect(args.onRefreshConstraints).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled(),
    );
    await expect(description).toHaveValue("Retained draft");
    await expect(canvas.getByText("Groceries (Expense)")).toBeVisible();
    await expect(args.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Retained draft" }),
    );
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

export const SaveFailed: Story = {
  parameters: { docs: { story: { autoplay: true } } },
  args: { ...FailedSubmitRetainsDraft.args },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Draft could not be saved.",
    );
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled();
  },
};

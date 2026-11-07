import { Button, Stack, Text } from "@mantine/core";
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import {
  StatementImportSettingsDialog,
  type StatementImportSettingsDialogProps,
} from "./settings-dialog";
import {
  debitCreditFormat,
  foreignCurrencyFormat,
  headerlessFormat,
  orderedFormat,
  signedFormat,
} from "./fixtures";
import { SAMPLE_EXAMPLES } from "./examples";

type HarnessProps = Omit<StatementImportSettingsDialogProps, "opened">;
function SettingsHarness({
  initialFormat,
  onSave,
  onClose,
  accountName,
}: HarnessProps) {
  const [opened, setOpened] = useState(true);
  const [savedFormat, setSavedFormat] = useState(initialFormat);
  const [saved, setSaved] = useState(false);
  return (
    <Stack p="xl" align="start">
      <Text fw={600}>{accountName}</Text>
      <Text size="sm" c="dimmed">
        Standalone prototype. Changes stay in this story until it is reset.
      </Text>
      <Button onClick={() => setOpened(true)}>Open Import Settings</Button>
      {saved && (
        <Text role="status">
          Settings saved in this story. Statement imports are{" "}
          {savedFormat ? "enabled" : "disabled"}.
        </Text>
      )}
      <StatementImportSettingsDialog
        opened={opened}
        accountName={accountName}
        initialFormat={savedFormat}
        onClose={() => {
          setOpened(false);
          onClose();
        }}
        onSave={(format) => {
          setSavedFormat(format);
          setSaved(true);
          setOpened(false);
          onSave(format);
        }}
      />
    </Stack>
  );
}

const meta = {
  title: "Prototypes/StatementImportSettingsDialog",
  component: StatementImportSettingsDialog,
  render: (args) => <SettingsHarness {...args} />,
  args: {
    opened: true,
    accountName: "Everyday Checking · CHF",
    initialFormat: signedFormat,
    onClose: fn(),
    onSave: fn(),
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof StatementImportSettingsDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

async function getDialog(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body).findByRole("dialog", {
    name: "Statement Import Settings",
  });
}
async function loadExample(canvasElement: HTMLElement, name: string) {
  const body = within(canvasElement.ownerDocument.body);
  const dialog = await getDialog(canvasElement);
  await userEvent.click(
    within(dialog).getByRole("combobox", { name: "Load an Example" }),
  );
  await userEvent.click(await body.findByRole("option", { name }));
  return dialog;
}
async function parsedView(canvasElement: HTMLElement, example: string) {
  const dialog = await loadExample(canvasElement, example);
  await userEvent.click(
    within(dialog).getByRole("tab", { name: "Parsed Preview" }),
  );
  return dialog;
}
async function setHeader(dialog: HTMLElement, label: string, value: string) {
  const field = within(dialog).getByRole("combobox", {
    name: label,
  });
  await userEvent.clear(field);
  await userEvent.type(field, value);
  await userEvent.tab();
}

export const EmptySetup: Story = {
  args: { initialFormat: null },
  play: async ({ canvasElement }) => {
    const dialog = await getDialog(canvasElement);
    await userEvent.click(
      within(dialog).getByRole("switch", { name: "Enable Statement Imports" }),
    );
    await loadExample(canvasElement, "Signed Amounts");
    await expect(
      within(dialog).getByRole("combobox", {
        name: "Date Column",
      }),
    ).toHaveValue("");
    await expect(
      within(dialog).getByRole("combobox", {
        name: "Amount Column",
      }),
    ).toHaveValue("");
  },
};

export const ExistingSettings: Story = {
  args: { initialFormat: orderedFormat },
  play: async ({ canvasElement }) => {
    const dialog = await getDialog(canvasElement);
    await expect(
      within(dialog).getByRole("textbox", { name: "Date Column" }),
    ).toHaveValue("1");
    await expect(
      within(dialog).getByRole("textbox", {
        name: "Amount Column",
      }),
    ).toHaveValue("2");
  },
};

export const SignedAmounts: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await parsedView(canvasElement, "Signed Amounts");
    await expect(
      await within(dialog).findByRole("gridcell", {
        name: "-42.5",
      }),
    ).toBeVisible();
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: "Invert Amount Signs" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("gridcell", { name: "42.5" }),
      ).toBeVisible(),
    );
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: "Invert Amount Signs" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("gridcell", { name: "-42.5" }),
      ).toBeVisible(),
    );
  },
};

export const DebitCredit: Story = {
  args: { initialFormat: debitCreditFormat },
  play: async ({ canvasElement }) => {
    const dialog = await parsedView(canvasElement, "Debit/Credit");
    await expect(
      await within(dialog).findByRole("gridcell", {
        name: "2,500",
      }),
    ).toBeVisible();
    await expect(
      within(dialog).getByRole("gridcell", { name: "-42.5" }),
    ).toBeVisible();
  },
};

export const Headerless: Story = {
  args: { initialFormat: headerlessFormat },
  play: async ({ canvasElement }) => {
    const dialog = await parsedView(canvasElement, "Without Headers");
    await expect(
      within(dialog).getByRole("checkbox", {
        name: "First Row Contains Headers",
      }),
    ).not.toBeChecked();
    await expect(
      await within(dialog).findByRole("gridcell", {
        name: "-42.5",
      }),
    ).toBeVisible();
  },
};

export const CombinedDescriptions: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await parsedView(canvasElement, "Signed Amounts");
    const fields = within(dialog);
    await expect(
      await fields.findByRole("gridcell", {
        name: "Corner Market · Groceries",
      }),
    ).toBeVisible();
    await userEvent.click(
      fields.getByRole("button", { name: "Move Description Column 2 Up" }),
    );
    await waitFor(() =>
      expect(
        fields.getByRole("gridcell", { name: "Groceries · Corner Market" }),
      ).toBeVisible(),
    );
    await userEvent.clear(
      fields.getByRole("textbox", { name: "Joining Separator" }),
    );
    await userEvent.type(
      fields.getByRole("textbox", { name: "Joining Separator" }),
      " / ",
    );
    await waitFor(() =>
      expect(
        fields.getByRole("gridcell", { name: "Groceries / Corner Market" }),
      ).toBeVisible(),
    );
    await userEvent.click(
      fields.getByRole("button", { name: "Add Description Column" }),
    );
    await setHeader(dialog, "Description Column 3", "Date");
    await expect(
      fields.getByRole("combobox", {
        name: "Description Column 3",
      }),
    ).toHaveValue("Date");
    await userEvent.click(
      fields.getByRole("button", { name: "Remove Description Column 3" }),
    );
    await expect(
      fields.queryByRole("combobox", {
        name: "Description Column 3",
      }),
    ).not.toBeInTheDocument();
  },
};

export const ForeignCurrency: Story = {
  args: { initialFormat: foreignCurrencyFormat },
  play: async ({ canvasElement }) => {
    const dialog = await parsedView(canvasElement, "Signed Amounts");
    await expect(
      within(dialog).getByText(/currently ignored by the importer/),
    ).toBeVisible();
    await expect(
      within(dialog).getByRole("combobox", {
        name: "Original Currency Column",
      }),
    ).toHaveValue("Original Currency");
  },
};

export const InvalidSample: Story = {
  play: async ({ canvasElement, args }) => {
    const dialog = await parsedView(canvasElement, "Invalid Values");
    await expect(
      await within(dialog).findByText("2 Preview Rows Have Errors"),
    ).toBeVisible();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save Settings" }),
    );
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        mappings: expect.objectContaining({ date: { header: "Date" } }),
      }),
    );
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "Open Import Settings",
      }),
    );
    await parsedView(canvasElement, "Invalid Values");
  },
};

export const DisabledImports: Story = {
  args: { initialFormat: null },
  play: async ({ canvasElement, args }) => {
    const dialog = await getDialog(canvasElement);
    await expect(
      within(dialog).getByRole("switch", { name: "Enable Statement Imports" }),
    ).not.toBeChecked();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save Settings" }),
    );
    await expect(args.onSave).toHaveBeenCalledWith(null);
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "Open Import Settings",
      }),
    );
    await expect(
      within(await getDialog(canvasElement)).getByRole("switch", {
        name: "Enable Statement Imports",
      }),
    ).not.toBeChecked();
  },
};

export const ManualMappingAndSave: Story = {
  args: { initialFormat: null },
  play: async ({ canvasElement, args }) => {
    const dialog = await getDialog(canvasElement);
    const fields = within(dialog);
    await userEvent.click(
      fields.getByRole("switch", { name: "Enable Statement Imports" }),
    );
    await userEvent.click(
      fields.getByRole("button", { name: "Save Settings" }),
    );
    await expect(
      fields.getByText(
        "Complete the highlighted column mappings before saving.",
      ),
    ).toBeVisible();
    await expect(args.onSave).not.toHaveBeenCalled();
    const fileInput =
      dialog.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error("CSV file input is missing.");
    await userEvent.upload(
      fileInput,
      new File([SAMPLE_EXAMPLES.signed.text], "checking.csv", {
        type: "text/csv",
      }),
    );
    await expect(await fields.findByText("checking.csv")).toBeVisible();
    await expect(
      fields.getByRole("combobox", { name: "Date Column" }),
    ).toHaveValue("");
    await setHeader(dialog, "Date Column", "Date");
    await setHeader(dialog, "Amount Column", "Amount");
    await userEvent.click(fields.getByRole("tab", { name: "Parsed Preview" }));
    await expect(
      await fields.findByRole("gridcell", { name: "-42.5" }),
    ).toBeVisible();
    await userEvent.click(
      fields.getByRole("button", { name: "Save Settings" }),
    );
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        mappings: expect.objectContaining({
          date: { header: "Date" },
          amount: {
            mode: "signed",
            column: { header: "Amount" },
            invertSign: false,
          },
        }),
      }),
    );
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "Open Import Settings",
      }),
    );
    const reopened = within(await getDialog(canvasElement));
    await expect(
      reopened.getByRole("combobox", { name: "Date Column" }),
    ).toHaveValue("Date");
    await expect(reopened.queryByText("checking.csv")).not.toBeInTheDocument();
  },
};

export const ReplaceSample: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await loadExample(canvasElement, "Signed Amounts");
    await loadExample(canvasElement, "Debit/Credit");
    await expect(
      within(dialog).getByRole("combobox", {
        name: "Amount Column",
      }),
    ).toHaveValue("Amount");
    await expect(
      within(dialog).getByText("Column “Amount” is missing from the sample."),
    ).toBeVisible();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Clear Sample" }),
    );
    await expect(
      within(dialog).queryByText("Sample Needs Attention"),
    ).not.toBeInTheDocument();
  },
};

export const DiscardChanges: Story = {
  play: async ({ canvasElement, args }) => {
    for (const action of ["cancel", "escape", "close"] as const) {
      const dialog = await getDialog(canvasElement);
      await userEvent.click(
        within(dialog).getByRole("checkbox", { name: "Invert Amount Signs" }),
      );
      if (action === "escape") await userEvent.keyboard("{Escape}");
      else
        await userEvent.click(
          within(dialog).getByRole("button", {
            name:
              action === "cancel"
                ? "Cancel"
                : "Close Statement Import Settings",
          }),
        );
      await waitFor(() => expect(dialog).not.toBeInTheDocument());
      await userEvent.click(
        within(canvasElement).getByRole("button", {
          name: "Open Import Settings",
        }),
      );
      await expect(
        within(await getDialog(canvasElement)).getByRole("checkbox", {
          name: "Invert Amount Signs",
        }),
      ).not.toBeChecked();
    }
    await expect(args.onSave).not.toHaveBeenCalled();
    await expect(args.onClose).toHaveBeenCalledTimes(3);
  },
};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: "cashfolioMobile" } },
  play: async ({ canvasElement }) => {
    const dialog = await parsedView(canvasElement, "Signed Amounts");
    const save = within(dialog).getByRole("button", { name: "Save Settings" });
    await expect(save).toBeVisible();
    expect(save.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    expect(save.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      window.innerHeight,
    );
    expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth);
  },
};

export const Dark: Story = {
  parameters: { colorScheme: "dark" },
  play: async ({ canvasElement }) => {
    await parsedView(canvasElement, "Signed Amounts");
  },
};

export const ManualWithoutSample: Story = {
  args: { initialFormat: null },
  play: async ({ canvasElement, args }) => {
    const dialog = await getDialog(canvasElement);
    const fields = within(dialog);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      fields.getByRole("switch", { name: "Enable Statement Imports" }),
    );
    await userEvent.click(
      fields.getByRole("checkbox", { name: "First Row Contains Headers" }),
    );
    for (const [label, position] of [
      ["Date Column", "1"],
      ["Amount Column", "2"],
    ]) {
      await userEvent.click(
        fields.getByRole("combobox", { name: `${label} Reference` }),
      );
      await userEvent.click(
        await body.findByRole("option", { name: "Position" }),
      );
      await userEvent.type(
        fields.getByRole("textbox", { name: label }),
        position,
      );
    }
    await userEvent.click(
      fields.getByRole("combobox", { name: "Decimal Separator" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Comma (,)" }),
    );
    await userEvent.click(
      fields.getByRole("combobox", { name: "Thousands Separator" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Comma (,)" }),
    );
    await expect(
      fields.getByText("Decimal and thousands separators must be different."),
    ).toBeVisible();
    await userEvent.click(
      fields.getByRole("button", { name: "Save Settings" }),
    );
    await expect(args.onSave).not.toHaveBeenCalled();
    await userEvent.click(
      fields.getByRole("combobox", { name: "Thousands Separator" }),
    );
    await userEvent.click(await body.findByRole("option", { name: "Space" }));
    await userEvent.click(
      fields.getByRole("button", { name: "Save Settings" }),
    );
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        hasHeader: false,
        numberFormat: { decimalSeparator: ",", thousandsSeparator: " " },
        mappings: {
          date: { index: 0 },
          amount: { mode: "signed", column: { index: 1 }, invertSign: false },
        },
      }),
    );
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "Open Import Settings",
      }),
    );
  },
};

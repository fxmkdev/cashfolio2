import { Button, Stack, Text } from "@mantine/core";
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  expect,
  fireEvent,
  fn,
  spyOn,
  userEvent,
  waitFor,
  within,
} from "storybook/test";
import {
  StatementImportSettingsPage,
  type StatementImportSettingsPageProps,
} from "./settings-page";
import {
  debitCreditFormat,
  foreignCurrencyFormat,
  headerlessFormat,
  orderedFormat,
  signedFormat,
} from "./fixtures";
import { SAMPLE_EXAMPLES } from "./examples";

function SettingsHarness({
  initialFormat,
  onSave,
  onCancel,
  accountName,
}: StatementImportSettingsPageProps) {
  const [opened, setOpened] = useState(true);
  const [savedFormat, setSavedFormat] = useState(initialFormat);
  const [saved, setSaved] = useState(false);
  if (opened)
    return (
      <StatementImportSettingsPage
        accountName={accountName}
        initialFormat={savedFormat}
        onCancel={() => {
          setOpened(false);
          onCancel();
        }}
        onSave={(format) => {
          setSavedFormat(format);
          setSaved(true);
          setOpened(false);
          onSave(format);
        }}
      />
    );
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
    </Stack>
  );
}

const meta = {
  title: "Prototypes/StatementImportSettingsPage",
  component: StatementImportSettingsPage,
  render: (args) => <SettingsHarness {...args} />,
  args: {
    accountName: "Everyday Checking · CHF",
    initialFormat: signedFormat,
    onCancel: fn(),
    onSave: fn(),
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof StatementImportSettingsPage>;
export default meta;
type Story = StoryObj<typeof meta>;

async function getSettingsPage(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body).findByRole("main", {
    name: "Statement Import Settings",
  });
}
async function loadExample(canvasElement: HTMLElement, name: string) {
  const body = within(canvasElement.ownerDocument.body);
  const page = await getSettingsPage(canvasElement);
  await userEvent.click(
    within(page).getByRole("combobox", { name: "Load an Example" }),
  );
  await userEvent.click(await body.findByRole("option", { name }));
  return page;
}
async function parsedView(canvasElement: HTMLElement, example: string) {
  const page = await loadExample(canvasElement, example);
  await userEvent.click(
    within(page).getByRole("tab", { name: "Parsed Preview" }),
  );
  return page;
}
async function setHeader(page: HTMLElement, label: string, value: string) {
  const field = within(page).getByRole("combobox", {
    name: label,
  });
  await userEvent.clear(field);
  await userEvent.type(field, value);
  await userEvent.tab();
}

export const EmptySetup: Story = {
  args: { initialFormat: null },
  play: async ({ canvasElement }) => {
    const page = await getSettingsPage(canvasElement);
    await userEvent.click(
      within(page).getByRole("switch", { name: "Enable Statement Imports" }),
    );
    await loadExample(canvasElement, "Signed Amounts");
    await expect(
      within(page).getByRole("combobox", {
        name: "Date Column",
      }),
    ).toHaveValue("");
    await expect(
      within(page).getByRole("combobox", {
        name: "Amount Column",
      }),
    ).toHaveValue("");
  },
};

export const ExistingSettings: Story = {
  args: { initialFormat: orderedFormat },
  play: async ({ canvasElement }) => {
    const page = await getSettingsPage(canvasElement);
    await expect(
      within(page).getByRole("textbox", { name: "Date Column" }),
    ).toHaveValue("1");
    await expect(
      within(page).getByRole("textbox", {
        name: "Amount Column",
      }),
    ).toHaveValue("2");
  },
};

export const SignedAmounts: Story = {
  play: async ({ canvasElement }) => {
    const page = await parsedView(canvasElement, "Signed Amounts");
    await expect(
      await within(page).findByRole("gridcell", {
        name: "-42.5",
      }),
    ).toBeVisible();
    await userEvent.click(
      within(page).getByRole("checkbox", { name: "Invert Amount Signs" }),
    );
    await waitFor(() =>
      expect(
        within(page).getByRole("gridcell", { name: "42.5" }),
      ).toBeVisible(),
    );
    await userEvent.click(
      within(page).getByRole("checkbox", { name: "Invert Amount Signs" }),
    );
    await waitFor(() =>
      expect(
        within(page).getByRole("gridcell", { name: "-42.5" }),
      ).toBeVisible(),
    );
  },
};

export const DebitCredit: Story = {
  args: { initialFormat: debitCreditFormat },
  play: async ({ canvasElement }) => {
    const page = await parsedView(canvasElement, "Debit/Credit");
    await expect(
      await within(page).findByRole("gridcell", {
        name: "2,500",
      }),
    ).toBeVisible();
    await expect(
      within(page).getByRole("gridcell", { name: "-42.5" }),
    ).toBeVisible();
  },
};

export const Headerless: Story = {
  args: { initialFormat: headerlessFormat },
  play: async ({ canvasElement }) => {
    const page = await parsedView(canvasElement, "Without Headers");
    await expect(
      within(page).getByRole("checkbox", {
        name: "First Row Contains Headers",
      }),
    ).not.toBeChecked();
    await expect(
      await within(page).findByRole("gridcell", {
        name: "-42.5",
      }),
    ).toBeVisible();
  },
};

export const CombinedDescriptions: Story = {
  play: async ({ canvasElement }) => {
    const page = await parsedView(canvasElement, "Signed Amounts");
    const fields = within(page);
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
    await setHeader(page, "Description Column 3", "Date");
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
    const page = await parsedView(canvasElement, "Signed Amounts");
    await expect(
      within(page).getByText(/currently ignored by the importer/),
    ).toBeVisible();
    await expect(
      within(page).getByRole("combobox", {
        name: "Original Currency Column",
      }),
    ).toHaveValue("Original Currency");
  },
};

export const InvalidSample: Story = {
  play: async ({ canvasElement, args }) => {
    const page = await parsedView(canvasElement, "Invalid Values");
    await expect(
      await within(page).findByText("2 Preview Rows Have Errors"),
    ).toBeVisible();
    await userEvent.click(
      within(page).getByRole("button", { name: "Save Settings" }),
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
    const page = await getSettingsPage(canvasElement);
    await expect(
      within(page).getByRole("switch", { name: "Enable Statement Imports" }),
    ).not.toBeChecked();
    await userEvent.click(
      within(page).getByRole("button", { name: "Save Settings" }),
    );
    await expect(args.onSave).toHaveBeenCalledWith(null);
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "Open Import Settings",
      }),
    );
    await expect(
      within(await getSettingsPage(canvasElement)).getByRole("switch", {
        name: "Enable Statement Imports",
      }),
    ).not.toBeChecked();
  },
};

export const ManualMappingAndSave: Story = {
  args: { initialFormat: null },
  play: async ({ canvasElement, args }) => {
    const page = await getSettingsPage(canvasElement);
    const fields = within(page);
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
      page.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error("CSV file input is missing.");
    const openPicker = spyOn(fileInput, "click").mockImplementation(
      () => undefined,
    );
    await userEvent.click(
      fields.getByRole("button", { name: "Upload Sample CSV" }),
    );
    await expect(openPicker).toHaveBeenCalled();
    openPicker.mockRestore();
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
    await setHeader(page, "Date Column", "Date");
    await setHeader(page, "Amount Column", "Amount");
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
    const reopened = within(await getSettingsPage(canvasElement));
    await expect(
      reopened.getByRole("combobox", { name: "Date Column" }),
    ).toHaveValue("Date");
    await expect(reopened.queryByText("checking.csv")).not.toBeInTheDocument();
  },
};

export const ReplaceSample: Story = {
  play: async ({ canvasElement }) => {
    const page = await loadExample(canvasElement, "Signed Amounts");
    await loadExample(canvasElement, "Debit/Credit");
    await expect(
      within(page).getByRole("combobox", {
        name: "Amount Column",
      }),
    ).toHaveValue("Amount");
    await expect(
      within(page).getByText("Column “Amount” is missing from the sample."),
    ).toBeVisible();
    await userEvent.click(
      within(page).getByRole("button", { name: "Remove Sample" }),
    );
    await expect(
      within(page).queryByText("Sample Needs Attention"),
    ).not.toBeInTheDocument();
  },
};

export const DiscardChanges: Story = {
  play: async ({ canvasElement, args }) => {
    for (const action of ["Cancel", "Back to Account"]) {
      const page = await getSettingsPage(canvasElement);
      await expect(
        within(canvasElement).queryByRole("dialog"),
      ).not.toBeInTheDocument();
      await userEvent.click(
        within(page).getByRole("checkbox", { name: "Invert Amount Signs" }),
      );
      await userEvent.keyboard("{Escape}");
      await expect(page).toBeInTheDocument();
      await expect(
        within(page).getByRole("checkbox", { name: "Invert Amount Signs" }),
      ).toBeChecked();
      await userEvent.click(within(page).getByRole("button", { name: action }));
      await waitFor(() => expect(page).not.toBeInTheDocument());
      await userEvent.click(
        within(canvasElement).getByRole("button", {
          name: "Open Import Settings",
        }),
      );
      await expect(
        within(await getSettingsPage(canvasElement)).getByRole("checkbox", {
          name: "Invert Amount Signs",
        }),
      ).not.toBeChecked();
    }
    await expect(args.onSave).not.toHaveBeenCalled();
    await expect(args.onCancel).toHaveBeenCalledTimes(2);
  },
};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: "cashfolioMobile" } },
  play: async ({ canvasElement }) => {
    const page = await parsedView(canvasElement, "Signed Amounts");
    const save = within(page).getByRole("button", { name: "Save Settings" });
    await expect(save).toBeVisible();
    expect(save.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    expect(save.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      window.innerHeight,
    );
    expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
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
    const page = await getSettingsPage(canvasElement);
    const fields = within(page);
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

function sampleTransfer(files: File[]) {
  const dataTransfer = new DataTransfer();
  files.forEach((file) => dataTransfer.items.add(file));
  return dataTransfer;
}

// Construct native events so Testing Library preserves DataTransfer's prototype properties.
async function dragSample(
  target: HTMLElement,
  type: "dragenter" | "drop",
  dataTransfer: DataTransfer,
) {
  await fireEvent(
    target,
    new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }),
  );
}

export const DropSample: Story = {
  play: async ({ canvasElement }) => {
    const page = await getSettingsPage(canvasElement);
    const fields = within(page);
    const dropzone = fields.getByRole("button", { name: "Upload Sample CSV" });
    const dataTransfer = sampleTransfer([
      new File([SAMPLE_EXAMPLES.signed.text], "dropped.csv", {
        type: "text/csv",
      }),
    ]);
    await dragSample(dropzone, "dragenter", dataTransfer);
    await waitFor(() =>
      expect(dropzone).toHaveAttribute("data-accept", "true"),
    );
    await dragSample(dropzone, "drop", dataTransfer);
    await expect(await fields.findByText("dropped.csv")).toBeVisible();
    await expect(
      fields.getByRole("combobox", { name: "Amount Column" }),
    ).toHaveValue("Amount");
    await userEvent.click(fields.getByRole("tab", { name: "Parsed Preview" }));
    await expect(
      await fields.findByRole("gridcell", { name: "-42.5" }),
    ).toBeVisible();
    await userEvent.click(
      fields.getByRole("button", { name: "Remove Sample" }),
    );
    await expect(fields.queryByText("dropped.csv")).not.toBeInTheDocument();
    await expect(
      fields.queryByRole("tab", { name: "Parsed Preview" }),
    ).not.toBeInTheDocument();
    await expect(
      fields.getByRole("combobox", { name: "Amount Column" }),
    ).toHaveValue("Amount");
    await dragSample(dropzone, "drop", dataTransfer);
    await expect(await fields.findByText("dropped.csv")).toBeVisible();
  },
};

export const RejectedSample: Story = {
  play: async ({ canvasElement }) => {
    const page = await loadExample(canvasElement, "Signed Amounts");
    const fields = within(page);
    const dropzone = fields.getByRole("button", { name: "Upload Sample CSV" });
    const dataTransfer = sampleTransfer([
      new File(["not a CSV"], "statement.pdf", { type: "application/pdf" }),
    ]);
    await dragSample(dropzone, "dragenter", dataTransfer);
    await waitFor(() =>
      expect(dropzone).toHaveAttribute("data-reject", "true"),
    );
    await dragSample(dropzone, "drop", dataTransfer);
    await expect(
      await fields.findByText("Choose a CSV file with the .csv extension."),
    ).toBeVisible();
    await expect(
      fields.getByText("Signed Amounts", { exact: true }),
    ).toBeVisible();
    await expect(
      fields.getByRole("combobox", { name: "Amount Column" }),
    ).toHaveValue("Amount");
    const multipleFiles = sampleTransfer(
      ["first.csv", "second.csv"].map(
        (name) =>
          new File([SAMPLE_EXAMPLES.signed.text], name, { type: "text/csv" }),
      ),
    );
    await dragSample(dropzone, "drop", multipleFiles);
    await expect(
      await fields.findByText("Choose one CSV file at a time."),
    ).toBeVisible();
    await expect(
      fields.getByText("Signed Amounts", { exact: true }),
    ).toBeVisible();
    await userEvent.click(fields.getByRole("tab", { name: "Parsed Preview" }));
    await expect(
      await fields.findByRole("gridcell", { name: "-42.5" }),
    ).toBeVisible();
  },
};

export const UnreadableSample: Story = {
  play: async ({ canvasElement }) => {
    const page = await loadExample(canvasElement, "Signed Amounts");
    const fields = within(page);
    const fileInput =
      page.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error("CSV file input is missing.");
    const file = new File([SAMPLE_EXAMPLES.signed.text], "unreadable.csv", {
      type: "text/csv",
    });
    Object.defineProperty(file, "text", {
      value: () => Promise.reject(new Error("File is unavailable")),
    });
    await userEvent.upload(fileInput, file);
    await expect(
      await fields.findByText(
        "The file could not be read. Choose it again or try another CSV.",
      ),
    ).toBeVisible();
    await expect(
      fields.getByText("Signed Amounts", { exact: true }),
    ).toBeVisible();
    await expect(
      fields.getByRole("combobox", { name: "Amount Column" }),
    ).toHaveValue("Amount");
    await userEvent.click(fields.getByRole("tab", { name: "Parsed Preview" }));
    await expect(
      await fields.findByRole("gridcell", { name: "-42.5" }),
    ).toBeVisible();
  },
};

import { Buffer } from "node:buffer";
import type { Page } from "@playwright/test";
import { Unit } from "../../src/.prisma-client/enums";
import {
  agGridCellByColId,
  agGridRowByText,
  clickGridRowSelectionCheckbox,
  clickPinnedRowAction,
  setGridCellValue,
  setGridAccountTreeCellValue,
} from "../support/grid";
import {
  countTransactionsByDescription,
  getTransactionBookingsByDescription,
  seedDatabase,
  seedThreeBookingSplitTransaction,
  type SeededData,
} from "../support/db";
import { expect, test } from "../support/fixtures";
import { prisma } from "../support/db-client";
import { setGridAccountCellValue } from "../support/transaction-form";

let seeded: SeededData;

test.beforeAll(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
});

async function openStatementImportPage(page: Page) {
  await page.getByRole("button", { name: "Account actions" }).click();
  await page.getByRole("menuitem", { name: "Import Statement" }).click();
}

function ledgerUrlPattern(args: { accountBookId: string; accountId: string }) {
  return new RegExp(`/${args.accountBookId}/${args.accountId}(?:[?]|$)`);
}

async function selectImportCounterAccount(page: Page, description: string) {
  const row = agGridRowByText(page, description);
  await expect(row).toBeVisible();
  await setGridAccountTreeCellValue({
    root: page,
    rowIndex: Number(await row.getAttribute("row-index")),
    colId: "counterAccountId",
    accountName: seeded.expenseAccount.name,
  });
}

async function expectStatementUploadDropzone(page: Page) {
  await expect(page.getByText("Drop CSV File Here")).toBeVisible();
  await expect(
    page.getByText("Drag and drop a statement, or click to select one."),
  ).toBeVisible();
}

test("imports a statement after selecting the counter account in the review grid", async ({
  page,
}) => {
  const importedDescription = "E2E Statement Import Lunch";
  const csv = [
    "Booked;Cashflow;Original;Currency;Rate;Text;Ignored",
    `2026-05-14;-42.55;;;not-a-rate;${importedDescription};extra value`,
  ].join("\n");

  await page.goto(
    `/${seeded.accountBookId}/${seeded.cashAccount.id}?period=2026-04`,
  );
  await openStatementImportPage(page);

  await expect(page).toHaveURL(
    new RegExp(
      `/${seeded.accountBookId}/${seeded.cashAccount.id}/import-statement`,
    ),
  );
  await expect(
    page.getByRole("heading", { name: "Import Statement" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Upload/ })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "statement-import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });

  await expect(page.getByText("0 of 1 ready")).toBeVisible();
  const draftRow = agGridRowByText(page, importedDescription);
  await expect(draftRow).toBeVisible();
  await expect(agGridCellByColId(draftRow, "status")).toContainText(
    "Needs edit",
  );
  await expect(
    page.getByRole("button", { name: "Import Transactions" }),
  ).toBeDisabled();

  await selectImportCounterAccount(page, importedDescription);

  await expect(agGridCellByColId(draftRow, "counterAccountId")).toContainText(
    seeded.expenseAccount.name,
  );
  await expect(agGridCellByColId(draftRow, "status")).toContainText("Ready");
  await expect(page.getByText("1 of 1 ready")).toBeVisible();

  // Capture the initial redirect before the ledger consumes its scroll target.
  let importedSearch: URLSearchParams | undefined;
  const importNavigation = page.waitForURL((url) => {
    if (
      url.pathname !== `/${seeded.accountBookId}/${seeded.cashAccount.id}` ||
      !url.searchParams.get("transactionId")
    ) {
      return false;
    }
    importedSearch = url.searchParams;
    return true;
  });
  await page.getByRole("button", { name: "Import Transactions" }).click();
  await importNavigation;
  expect(importedSearch?.get("period")).toBe("2026-05");
  expect(importedSearch?.get("transactionId")).toBeTruthy();

  await expect(page).toHaveURL(
    ledgerUrlPattern({
      accountBookId: seeded.accountBookId,
      accountId: seeded.cashAccount.id,
    }),
  );
  await expect(agGridRowByText(page, importedDescription)).toBeVisible();

  const bookings = await getTransactionBookingsByDescription({
    accountBookId: seeded.accountBookId,
    description: importedDescription,
  });
  expect(bookings).toHaveLength(2);
  expect(bookings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        accountId: seeded.cashAccount.id,
        unit: Unit.CURRENCY,
        symbol: null,
        tradeCurrency: null,
        value: -42.55,
      }),
      expect.objectContaining({
        accountId: seeded.expenseAccount.id,
        unit: Unit.CURRENCY,
        symbol: null,
        tradeCurrency: null,
        value: 42.55,
      }),
    ]),
  );
});

test("shows multiple for drafts with several counter bookings", async ({
  page,
}) => {
  const importedDescription = "E2E Statement Import Multiple";
  const csv = [
    "Booked;Cashflow;Original;Currency;Rate;Text;Ignored",
    `2026-05-15;-42.55;;;ignored;${importedDescription};extra value`,
  ].join("\n");

  await page.goto(
    `/${seeded.accountBookId}/${seeded.cashAccount.id}?period=2026-04`,
  );
  await openStatementImportPage(page);

  await page.locator('input[type="file"]').setInputFiles({
    name: "statement-import-multiple.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });

  const draftRow = agGridRowByText(page, importedDescription);
  await expect(draftRow).toBeVisible();
  await clickPinnedRowAction({
    row: draftRow,
    actionLabel: "Edit Imported Transaction",
  });

  const editDialog = page.getByRole("dialog", {
    name: "Edit Imported Transaction",
  });
  await expect(editDialog).toBeVisible();
  await setGridAccountCellValue({
    dialog: editDialog,
    rowIndex: 1,
    accountName: seeded.savingsAccount.name,
  });
  await setGridCellValue(editDialog, 1, "debit", "30");
  await editDialog.getByRole("button", { name: "Add Booking" }).click();
  await setGridCellValue(editDialog, 2, "date", "05/15/2026");
  await setGridAccountCellValue({
    dialog: editDialog,
    rowIndex: 2,
    accountName: seeded.investmentsAccount.name,
  });
  await setGridCellValue(editDialog, 2, "debit", "12.55");
  await editDialog.getByRole("button", { name: "Save Draft" }).click();
  await expect(editDialog).toHaveCount(0);

  const counterCell = agGridCellByColId(draftRow, "counterAccountId");
  await expect(counterCell).toContainText("Multiple");
  await expect(agGridCellByColId(draftRow, "status")).toContainText("Ready");

  // Bring the scrolling column clear of the frozen Balance column.
  await page.locator(".ag-grid-viewport").evaluate((viewport) => {
    viewport.scrollLeft = 190;
  });
  await counterCell.dblclick();
  await expect(page.locator(".ag-cell-inline-editing")).toHaveCount(0);

  await page.getByRole("button", { name: "Import Transactions" }).click();
  await expect(page).toHaveURL(
    ledgerUrlPattern({
      accountBookId: seeded.accountBookId,
      accountId: seeded.cashAccount.id,
    }),
  );
  await expect(agGridRowByText(page, importedDescription)).toBeVisible();

  const bookings = await getTransactionBookingsByDescription({
    accountBookId: seeded.accountBookId,
    description: importedDescription,
  });
  expect(bookings).toHaveLength(3);
  expect(bookings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        accountId: seeded.cashAccount.id,
        value: -42.55,
      }),
      expect.objectContaining({
        accountId: seeded.savingsAccount.id,
        value: 30,
      }),
      expect.objectContaining({
        accountId: seeded.investmentsAccount.id,
        value: 12.55,
      }),
    ]),
  );
});

test("Shift applies the starting inclusion state to mixed statement ranges", async ({
  page,
}, testInfo) => {
  const descriptions = ["A", "B", "C", "D", "E"].map(
    (letter) => `E2E Statement Range ${letter}`,
  );
  const csv = [
    "Booked;Cashflow;Original;Currency;Rate;Text;Ignored",
    ...descriptions.map(
      (description, index) =>
        `2026-06-${10 + index};-${201 + index}.23;;;;${description};`,
    ),
  ].join("\n");
  const file = {
    name: "statement-ranges.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  };
  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);
  await openStatementImportPage(page);
  await page.locator('input[type="file"]').setInputFiles(file);

  const rows = descriptions.map((description) =>
    agGridRowByText(page, description),
  );
  const checkbox = (index: number) =>
    rows[index].locator(".ag-selection-checkbox input");
  const click = (index: number, shift = false) =>
    rows[index]
      .locator(".ag-selection-checkbox")
      .click({ modifiers: shift ? ["Shift"] : [] });
  const header = page.locator(".ag-header-select-all input[type=checkbox]");
  const guidance = page.getByText(
    "Check rows to include them in the import; uncheck to ignore them.",
    { exact: true },
  );
  const selectionHeader = page
    .getByRole("columnheader")
    .filter({ has: header });
  async function expectIncluded(indices: number[]) {
    for (let index = 0; index < rows.length; index++) {
      if (indices.includes(index)) await expect(checkbox(index)).toBeChecked();
      else await expect(checkbox(index)).not.toBeChecked();
    }
  }
  await expect(guidance).toBeVisible();
  await expect(selectionHeader).toBeVisible();
  await expect(selectionHeader).toHaveText("");
  await expect(selectionHeader).toHaveCSS("width", "50px");
  await expectIncluded([0, 1, 2, 3, 4]);
  await expect(checkbox(0)).toHaveAttribute(
    "aria-label",
    /Toggle Inclusion.*\(checked\)/,
  );

  // Without an anchor, Shift toggles only the endpoint.
  await click(4, true);
  await expectIncluded([0, 1, 2, 3]);
  await expect(checkbox(4)).toHaveAttribute(
    "aria-label",
    /Toggle Inclusion.*\(unchecked\)/,
  );
  await click(1);
  // The already-unchecked endpoint must still ignore the entire range.
  await click(4, true);
  await expectIncluded([0]);
  await click(2, true);
  await expectIncluded([0]);

  // An upward range includes all rows despite an already-checked endpoint.
  await click(3);
  await click(0, true);
  await expectIncluded([0, 1, 2, 3]);
  await click(1);
  await selectImportCounterAccount(page, descriptions[2]);
  await click(3, true);
  await expectIncluded([0]);
  await header.click();
  await expectIncluded([0, 1, 2, 3, 4]);

  // Header actions reset the anchor; the native mixed state includes all.
  await click(1);
  await expect(header).toBeChecked({ indeterminate: true });
  await header.click();
  await expect(header).toBeChecked();
  await click(3, true);
  await expectIncluded([0, 1, 2, 4]);
  await header.click();

  // Replacing a reviewed file clears the old anchor and checkbox states.
  await click(1);
  await page.getByRole("button", { name: /Upload/ }).click();
  await page
    .getByRole("dialog", { name: "Discard reviewed statement?" })
    .getByRole("button", { name: "Discard and upload another file" })
    .click();
  await page.locator('input[type="file"]').setInputFiles(file);
  await expectIncluded([0, 1, 2, 3, 4]);
  await click(2, true);
  await expectIncluded([0, 1, 3, 4]);
  await click(2);
  await expect(agGridCellByColId(rows[2], "status")).toContainText(
    "Needs edit",
  );

  // A no-op keyboard select-all must also clear the range anchor.
  await rows[1].locator(".ag-cell:has(.ag-selection-checkbox)").focus();
  await page.keyboard.press("ControlOrMeta+A");
  await click(3, true);
  await expectIncluded([0, 1, 2, 4]);
  await header.click();

  // Focus native selection cells to exercise actual Space/Shift+Space handling.
  await rows[1].locator(".ag-cell:has(.ag-selection-checkbox)").focus();
  await page.keyboard.press("Space");
  await expect(checkbox(1)).not.toBeChecked();
  await rows[3].locator(".ag-cell:has(.ag-selection-checkbox)").focus();
  await page.keyboard.press("Shift+Space");
  await expectIncluded([0, 4]);
  await expect(header).toBeChecked({ indeterminate: true });

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.screenshot({
      path: testInfo.outputPath(`range-review-${colorScheme}.png`),
    });
  }
  await page.setViewportSize({ width: 640, height: 800 });
  await expect(
    page.getByRole("button", { name: "Toggle Navigation" }),
  ).toBeVisible();
  // Wait for AppShell's desktop-to-mobile layout transition before visual QA.
  await expect
    .poll(
      async () =>
        (await page.locator(".ag-root-wrapper").boundingBox())?.x ?? Infinity,
    )
    .toBeLessThan(40);
  await expect(guidance).toBeVisible();
  await expect(selectionHeader).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("range-review-narrow.png"),
  });
  await page.setViewportSize({ width: 1280, height: 720 });

  for (const rowIndex of [0, 4]) {
    await selectImportCounterAccount(page, descriptions[rowIndex]);
  }
  await page.getByRole("button", { name: "Import Transactions" }).click();
  await expect(page).toHaveURL(
    ledgerUrlPattern({
      accountBookId: seeded.accountBookId,
      accountId: seeded.cashAccount.id,
    }),
  );
  for (let index = 0; index < descriptions.length; index++) {
    expect(
      await countTransactionsByDescription({
        accountBookId: seeded.accountBookId,
        description: descriptions[index],
      }),
    ).toBe(index === 0 || index === 4 ? 1 : 0);
  }
});

test("Space on the Edit button preserves the statement inclusion anchor", async ({
  page,
}) => {
  const descriptions = ["A", "B", "C", "D"].map(
    (letter) => `E2E Statement Edit Space ${letter}`,
  );
  const csv = [
    "Booked;Cashflow;Original;Currency;Rate;Text;Ignored",
    ...descriptions.map(
      (description, index) =>
        `2026-06-${20 + index};-${301 + index}.23;;;;${description};`,
    ),
  ].join("\n");
  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);
  await openStatementImportPage(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "statement-edit-space.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  const rows = descriptions.map((description) =>
    agGridRowByText(page, description),
  );
  const checkbox = (index: number) =>
    rows[index].locator(".ag-selection-checkbox input");
  async function activateEditWithSpace() {
    const edit = rows[2].getByRole("button", {
      name: "Edit Imported Transaction",
    });
    await edit.focus();
    await page.keyboard.press("Space");
    const dialog = page.getByRole("dialog", {
      name: "Edit Imported Transaction",
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  await expect(checkbox(3)).toBeChecked();

  // Edit activation must not create an anchor: only the endpoint toggles.
  await activateEditWithSpace();
  await rows[3].locator(".ag-selection-checkbox").click({
    modifiers: ["Shift"],
  });
  for (const index of [0, 1, 2]) await expect(checkbox(index)).toBeChecked();
  await expect(checkbox(3)).not.toBeChecked();

  // An include anchor must survive keyboard activation of another row's Edit.
  await rows[0].locator(".ag-selection-checkbox").click();
  await expect(checkbox(0)).not.toBeChecked();
  await rows[0].locator(".ag-selection-checkbox").click();
  await expect(checkbox(0)).toBeChecked();
  await activateEditWithSpace();
  await rows[3].locator(".ag-selection-checkbox").click({
    modifiers: ["Shift"],
  });
  for (const index of [0, 1, 2, 3]) await expect(checkbox(index)).toBeChecked();
});

test("checkboxes control statement row inclusion and skip unchecked rows during import", async ({
  page,
}, testInfo) => {
  const importedDescription = "E2E Statement Import Included";
  const firstIgnoredDescription = "E2E Statement Import Ignored First";
  const secondIgnoredDescription = "E2E Statement Import Ignored Second";
  const csv = [
    "Booked;Cashflow;Original;Currency;Rate;Text;Ignored",
    `2026-05-16;-12.35;;;ignored;${importedDescription};extra value`,
    `2026-05-17;-98.75;;;ignored;${firstIgnoredDescription};extra value`,
    `2026-05-18;-45.20;;;ignored;${secondIgnoredDescription};extra value`,
  ].join("\n");

  await seedThreeBookingSplitTransaction({
    accountBookId: seeded.accountBookId,
    description: "E2E Statement Import Starting Balance",
    currentAccountId: seeded.cashAccount.id,
    debitAccountIds: [seeded.savingsAccount.id, seeded.investmentsAccount.id],
  });

  await page.goto(
    `/${seeded.accountBookId}/${seeded.cashAccount.id}?period=2026-04`,
  );
  await openStatementImportPage(page);

  await page.locator('input[type="file"]').setInputFiles({
    name: "statement-import-ignore.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });

  const includedRow = agGridRowByText(page, importedDescription);
  const firstIgnoredRow = agGridRowByText(page, firstIgnoredDescription);
  const secondIgnoredRow = agGridRowByText(page, secondIgnoredDescription);
  await expect(includedRow).toBeVisible();
  await expect(firstIgnoredRow).toBeVisible();
  await expect(secondIgnoredRow).toBeVisible();

  const headerCheckbox = page.locator(
    ".ag-header-select-all input[type=checkbox]",
  );
  const includedCheckbox = includedRow.locator(".ag-selection-checkbox input");
  const firstIgnoredCheckbox = firstIgnoredRow.locator(
    ".ag-selection-checkbox input",
  );
  const secondIgnoredCheckbox = secondIgnoredRow.locator(
    ".ag-selection-checkbox input",
  );
  await expect(includedCheckbox).toBeChecked();
  await expect(firstIgnoredCheckbox).toBeChecked();
  await expect(secondIgnoredCheckbox).toBeChecked();
  await expect(headerCheckbox).toBeChecked();
  const carriedForwardRow = agGridRowByText(page, "Balance carried forward");
  await expect(carriedForwardRow).toBeVisible();
  await expect(carriedForwardRow.getByRole("checkbox")).toHaveCount(0);

  await clickGridRowSelectionCheckbox(firstIgnoredRow);
  await expect(firstIgnoredCheckbox).not.toBeChecked();
  await expect(agGridCellByColId(firstIgnoredRow, "status")).toContainText(
    "Ignored",
  );
  await expect(firstIgnoredRow).toHaveClass(/statement-import-row-ignored/);
  await expect(page.getByText("0 of 3 ready, 1 ignored")).toBeVisible();
  await expect(headerCheckbox).toBeChecked({ indeterminate: true });

  await page.getByRole("button", { name: /Upload/ }).click();
  const discardDialog = page.getByRole("dialog", {
    name: "Discard reviewed statement?",
  });
  await expect(discardDialog).toBeVisible();
  await discardDialog.getByRole("button", { name: "Keep reviewing" }).click();
  await expect(discardDialog).toHaveCount(0);
  await expect(includedRow).toBeVisible();

  await page.getByRole("button", { name: /Upload/ }).click();
  await discardDialog
    .getByRole("button", { name: "Discard and upload another file" })
    .click();
  await expectStatementUploadDropzone(page);
  await page.getByRole("button", { name: /Review/ }).click();
  await expectStatementUploadDropzone(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "statement-import-ignore-reupload.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(includedRow).toBeVisible();

  await expect(includedCheckbox).toBeChecked();
  await expect(firstIgnoredCheckbox).toBeChecked();
  await expect(secondIgnoredCheckbox).toBeChecked();
  await expect(headerCheckbox).toBeChecked();
  await expect(page.getByRole("button", { name: /selected rows/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", {
      name: /(?:Unignore|Ignore) Imported Transaction/,
    }),
  ).toHaveCount(0);

  await headerCheckbox.click();
  await expect(includedCheckbox).not.toBeChecked();
  await expect(firstIgnoredCheckbox).not.toBeChecked();
  await expect(secondIgnoredCheckbox).not.toBeChecked();
  await expect(page.getByText("0 of 3 ready, 3 ignored")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import Transactions" }),
  ).toBeDisabled();

  await headerCheckbox.click();
  await expect(includedCheckbox).toBeChecked();
  await expect(firstIgnoredCheckbox).toBeChecked();
  await expect(secondIgnoredCheckbox).toBeChecked();
  await expect(headerCheckbox).toBeChecked();

  await clickGridRowSelectionCheckbox(firstIgnoredRow);
  await clickGridRowSelectionCheckbox(secondIgnoredRow);
  await expect(firstIgnoredCheckbox).not.toBeChecked();
  await expect(secondIgnoredCheckbox).not.toBeChecked();
  await expect(page.getByText("0 of 3 ready, 2 ignored")).toBeVisible();

  await clickGridRowSelectionCheckbox(firstIgnoredRow);
  await expect(firstIgnoredCheckbox).toBeChecked();
  await expect(agGridCellByColId(firstIgnoredRow, "status")).toContainText(
    "Needs edit",
  );
  await expect(firstIgnoredRow).not.toHaveClass(/statement-import-row-ignored/);
  await clickGridRowSelectionCheckbox(firstIgnoredRow);
  await expect(firstIgnoredCheckbox).not.toBeChecked();

  await selectImportCounterAccount(page, importedDescription);

  await expect(agGridCellByColId(includedRow, "status")).toContainText("Ready");
  await expect(page.getByText("1 of 3 ready, 2 ignored")).toBeVisible();

  await expect(includedCheckbox).toBeChecked();
  await expect(firstIgnoredCheckbox).not.toBeChecked();
  await expect(secondIgnoredCheckbox).not.toBeChecked();
  await expect(headerCheckbox).toBeChecked({ indeterminate: true });

  await expect(
    firstIgnoredRow.getByRole("button", { name: "Edit Imported Transaction" }),
  ).toBeDisabled();

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      colorScheme,
    );
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: testInfo.outputPath(`review-${colorScheme}.png`),
    });
  }

  await page.getByRole("button", { name: "Import Transactions" }).click();
  await expect(page).toHaveURL(
    ledgerUrlPattern({
      accountBookId: seeded.accountBookId,
      accountId: seeded.cashAccount.id,
    }),
  );
  await expect(agGridRowByText(page, importedDescription)).toBeVisible();

  const includedBookings = await getTransactionBookingsByDescription({
    accountBookId: seeded.accountBookId,
    description: importedDescription,
  });
  expect(includedBookings).toHaveLength(2);

  const firstIgnoredTransactionCount = await countTransactionsByDescription({
    accountBookId: seeded.accountBookId,
    description: firstIgnoredDescription,
  });
  const secondIgnoredTransactionCount = await countTransactionsByDescription({
    accountBookId: seeded.accountBookId,
    description: secondIgnoredDescription,
  });
  expect(firstIgnoredTransactionCount).toBe(0);
  expect(secondIgnoredTransactionCount).toBe(0);
});

test("overlapping statements skip existing transactions and transfers while preserving repeated payments", async ({
  page,
}) => {
  const existingDescription = "E2E Existing Statement Payment";
  const changedDescription = "E2E CSV Payment Description Before Edit";
  const transferDescription = "E2E CSV Transfer";
  const extraDescription = "E2E Additional Same Day Payment";
  const newDescription = "E2E New Statement Payment";
  await prisma.transaction.create({
    data: {
      accountBookId: seeded.accountBookId,
      description: existingDescription,
      bookings: {
        create: [
          {
            accountId: seeded.cashAccount.id,
            date: new Date("2026-06-03"),
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -27.35,
            description: "Edited booking text",
          },
          {
            accountId: seeded.expenseAccount.id,
            date: new Date("2026-06-03"),
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 27.35,
            description: "",
          },
        ],
      },
    },
  });
  // The target account is the counter leg of a transaction entered elsewhere.
  await prisma.transaction.create({
    data: {
      accountBookId: seeded.accountBookId,
      description: "Transfer entered from savings",
      bookings: {
        create: [
          {
            accountId: seeded.savingsAccount.id,
            date: new Date("2026-06-04"),
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -60.1,
            description: "",
          },
          {
            accountId: seeded.cashAccount.id,
            date: new Date("2026-06-05"),
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 60.1,
            description: "",
          },
        ],
      },
    },
  });
  const csv = [
    "Booked;Cashflow;Original;Currency;Rate;Text",
    `2026-06-03;-27.35;;;;${changedDescription}`,
    `2026-06-03;-27.35;;;;${extraDescription}`,
    `2026-06-05;60.10;;;;${transferDescription}`,
    `2026-06-06;-18.20;;;;${newDescription}`,
  ].join("\n");
  await page.goto(
    `/${seeded.accountBookId}/${seeded.cashAccount.id}?period=2026-04`,
  );
  await openStatementImportPage(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "overlap.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  for (const description of [changedDescription, transferDescription]) {
    const row = agGridRowByText(page, description);
    await expect(agGridCellByColId(row, "status")).toContainText(
      "Already exists",
    );
    await expect(row.locator(".ag-selection-checkbox input")).not.toBeChecked();
  }
  await expect(page.getByText("0 of 4 ready, 2 ignored")).toBeVisible();
  await selectImportCounterAccount(page, extraDescription);
  await selectImportCounterAccount(page, newDescription);
  await page.getByRole("button", { name: "Import Transactions" }).click();
  await expect(page).toHaveURL(
    ledgerUrlPattern({
      accountBookId: seeded.accountBookId,
      accountId: seeded.cashAccount.id,
    }),
  );
  expect(
    await countTransactionsByDescription({
      accountBookId: seeded.accountBookId,
      description: changedDescription,
    }),
  ).toBe(0);
  expect(
    await countTransactionsByDescription({
      accountBookId: seeded.accountBookId,
      description: transferDescription,
    }),
  ).toBe(0);
  expect(
    await countTransactionsByDescription({
      accountBookId: seeded.accountBookId,
      description: existingDescription,
    }),
  ).toBe(1);
  expect(
    await countTransactionsByDescription({
      accountBookId: seeded.accountBookId,
      description: extraDescription,
    }),
  ).toBe(1);
  expect(
    await countTransactionsByDescription({
      accountBookId: seeded.accountBookId,
      description: newDescription,
    }),
  ).toBe(1);

  // Reimporting the expanded statement now matches every row.
  await openStatementImportPage(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "overlap-again.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.getByText("0 of 4 ready, 4 ignored")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import Transactions" }),
  ).toBeDisabled();
  const override = agGridRowByText(page, changedDescription);
  await clickGridRowSelectionCheckbox(override);
  await expect(agGridCellByColId(override, "status")).toContainText(
    "Needs edit",
  );
  await selectImportCounterAccount(page, changedDescription);
  await expect(page.getByText("1 of 4 ready, 3 ignored")).toBeVisible();
  await page.getByRole("button", { name: "Import Transactions" }).click();
  await expect(page).toHaveURL(
    ledgerUrlPattern({
      accountBookId: seeded.accountBookId,
      accountId: seeded.cashAccount.id,
    }),
  );
  expect(
    await countTransactionsByDescription({
      accountBookId: seeded.accountBookId,
      description: changedDescription,
    }),
  ).toBe(1);
});

test("previews historical balances and read-only unmatched bookings during a partial import", async ({
  page,
  e2eExternalId,
}, testInfo) => {
  const scenario = await seedDatabase({ userExternalId: e2eExternalId });
  const history = [
    { date: "2026-01-01", amount: 100, description: "Preview opening" },
    {
      date: "2026-02-02",
      amount: -10,
      description: "Preview existing payment",
    },
    { date: "2026-02-03", amount: 5, description: "Preview manual booking" },
    { date: "2026-02-10", amount: 1000, description: "Preview later activity" },
  ];
  for (const entry of history) {
    await prisma.transaction.create({
      data: {
        accountBookId: scenario.accountBookId,
        description: entry.description,
        bookings: {
          create: [
            {
              accountId: scenario.cashAccount.id,
              date: new Date(entry.date),
              unit: Unit.CURRENCY,
              currency: "CHF",
              value: entry.amount,
              description: "",
            },
            {
              accountId: scenario.savingsAccount.id,
              date: new Date(entry.date),
              unit: Unit.CURRENCY,
              currency: "CHF",
              value: -entry.amount,
              description: "",
            },
          ],
        },
      },
    });
  }
  const csv = [
    "Booked;Cashflow;Original;Currency;Rate;Text",
    "2026-02-02;-10;;;;Preview existing payment",
    "2026-02-04;-20;;;;Preview candidate A",
    "2026-02-04;-20;;;;Preview candidate B",
  ].join("\n");
  await page.goto(
    `/${scenario.accountBookId}/${scenario.cashAccount.id}?period=2026-04`,
  );
  await openStatementImportPage(page);
  const upload = () =>
    page.locator('input[type="file"]').setInputFiles({
      name: "preview.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await upload();
  await expect(page.getByText("0 of 3 ready, 1 ignored")).toBeVisible();
  const candidateA = agGridRowByText(page, "Preview candidate A");
  const candidateB = agGridRowByText(page, "Preview candidate B");
  const matched = agGridRowByText(page, "Preview existing payment");
  const manual = agGridRowByText(page, "Preview manual booking");
  await expect(candidateA).toHaveAttribute("row-index", "0");
  await expect(candidateB).toHaveAttribute("row-index", "1");
  await expect(manual).toHaveAttribute("row-index", "2");
  await expect(matched).toHaveAttribute("row-index", "3");
  await expect(agGridCellByColId(candidateA, "balance")).toHaveText("55.00");
  await expect(agGridCellByColId(candidateB, "balance")).toHaveText("75.00");
  await expect(agGridCellByColId(matched, "balance")).toHaveText("90.00");
  await expect(agGridCellByColId(manual, "balance")).toHaveText("95.00");
  await expect(agGridCellByColId(manual, "amount")).toHaveText("5.00");
  await expect(agGridCellByColId(manual, "status")).toContainText(
    "Existing · not in statement",
  );
  await expect(manual.getByRole("checkbox")).toHaveCount(0);
  await expect(manual.getByRole("button")).toHaveCount(0);
  await agGridCellByColId(manual, "description").dblclick();
  await expect(page.locator(".ag-cell-inline-editing")).toHaveCount(0);
  await page.locator(".ag-grid-viewport").evaluate((viewport) => {
    viewport.scrollLeft = 190;
  });
  await agGridCellByColId(manual, "counterAccountId").dblclick();
  await expect(page.locator(".ag-cell-inline-editing")).toHaveCount(0);
  await expect(agGridRowByText(page, "Preview later activity")).toHaveCount(0);
  await expect(
    agGridCellByColId(
      agGridRowByText(page, "Balance carried forward"),
      "balance",
    ),
  ).toHaveText("100.00");
  await clickGridRowSelectionCheckbox(candidateA);
  await expect(agGridCellByColId(candidateA, "balance")).toHaveText("75.00");
  await expect(page.getByText("0 of 3 ready, 2 ignored")).toBeVisible();
  await clickGridRowSelectionCheckbox(candidateA);
  for (const row of [candidateA, candidateB]) {
    await setGridAccountTreeCellValue({
      root: page,
      rowIndex: Number(await row.getAttribute("row-index")),
      colId: "counterAccountId",
      accountName: scenario.expenseAccount.name,
    });
  }
  await expect(page.getByText("2 of 3 ready, 1 ignored")).toBeVisible();
  await page.locator(".ag-grid-viewport").evaluate((viewport) => {
    viewport.scrollLeft = 0;
  });
  await page.screenshot({
    path: testInfo.outputPath("existing-booking-preview.png"),
  });
  await page.getByRole("button", { name: "Import Transactions" }).click();
  await expect(page).toHaveURL(
    ledgerUrlPattern({
      accountBookId: scenario.accountBookId,
      accountId: scenario.cashAccount.id,
    }),
  );
  expect(
    await prisma.transaction.count({
      where: { accountBookId: scenario.accountBookId },
    }),
  ).toBe(6);
  for (const description of [
    "Preview candidate A",
    "Preview candidate B",
    "Preview manual booking",
    "Preview existing payment",
  ]) {
    expect(
      await countTransactionsByDescription({
        accountBookId: scenario.accountBookId,
        description,
      }),
    ).toBe(1);
  }
  await openStatementImportPage(page);
  await upload();
  await expect(page.getByText("0 of 3 ready, 3 ignored")).toBeVisible();
  await expect(agGridCellByColId(candidateA, "balance")).toHaveText("55.00");
  await expect(agGridCellByColId(candidateB, "balance")).toHaveText("75.00");
  await expect(manual).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import Transactions" }),
  ).toBeDisabled();
});

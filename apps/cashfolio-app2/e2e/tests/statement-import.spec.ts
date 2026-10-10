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

  await setGridAccountTreeCellValue({
    root: page,
    rowIndex: 0,
    colId: "counterAccountId",
    accountName: seeded.expenseAccount.name,
  });

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

  await setGridAccountTreeCellValue({
    root: page,
    rowIndex: 0,
    colId: "counterAccountId",
    accountName: seeded.expenseAccount.name,
  });

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
  await setGridAccountTreeCellValue({
    root: page,
    rowIndex: 1,
    colId: "counterAccountId",
    accountName: seeded.expenseAccount.name,
  });
  await setGridAccountTreeCellValue({
    root: page,
    rowIndex: 3,
    colId: "counterAccountId",
    accountName: seeded.expenseAccount.name,
  });
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
  await setGridAccountTreeCellValue({
    root: page,
    rowIndex: 0,
    colId: "counterAccountId",
    accountName: seeded.expenseAccount.name,
  });
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

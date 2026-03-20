import { expect, test, type Page } from "@playwright/test";
import {
  agGridRowByText,
  clickRowAction,
  setGridCellValue,
} from "../support/grid";
import {
  closeDatabase,
  resetAndSeedDatabase,
  type SeededData,
} from "../support/db";

let seeded: SeededData;

async function openCreateTransaction(page: Page) {
  await page.getByTestId("ledger-add-transaction").click();
  await expect(
    page.getByRole("heading", { name: "Add Transaction" }),
  ).toBeVisible();
}

async function fillTransactionHeader(page: Page, description: string) {
  await page.getByLabel("Date").fill("01.01.2026");
  await page.getByLabel("Description").fill(description);
}

test.beforeAll(async () => {
  seeded = await resetAndSeedDatabase();
});

test.afterAll(async () => {
  await closeDatabase();
});

test("create, edit, delete, and create multi-booking transaction", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);

  await openCreateTransaction(page);
  await fillTransactionHeader(page, "E2E Transaction 1");
  await setGridCellValue(page, 0, "credit", "100");
  await setGridCellValue(page, 1, "date", "01.01.2026");
  await setGridCellValue(page, 1, "account", seeded.savingsAccount.name);
  await setGridCellValue(page, 1, "debit", "100");
  await page.getByTestId("transaction-modal-submit").click();

  const createdTransactionRow = agGridRowByText(page, "E2E Transaction 1");
  await expect(createdTransactionRow).toBeVisible();

  await clickRowAction(createdTransactionRow, "Edit");
  await expect(
    page.getByRole("heading", { name: "Edit Transaction" }),
  ).toBeVisible();

  await page.getByLabel("Description").fill("E2E Transaction 1 Updated");
  await page.getByTestId("transaction-modal-submit").click();

  const updatedTransactionRow = agGridRowByText(
    page,
    "E2E Transaction 1 Updated",
  );
  await expect(updatedTransactionRow).toBeVisible();

  await clickRowAction(updatedTransactionRow, "Delete");
  await page.getByTestId("confirm-delete-button").click();
  await expect(agGridRowByText(page, "E2E Transaction 1 Updated")).toHaveCount(
    0,
  );

  await openCreateTransaction(page);
  await fillTransactionHeader(page, "E2E Split Transaction");
  await setGridCellValue(page, 0, "credit", "300");
  await setGridCellValue(page, 1, "date", "01.01.2026");
  await setGridCellValue(page, 1, "account", seeded.savingsAccount.name);
  await setGridCellValue(page, 1, "debit", "100");
  await page.getByTestId("transaction-add-booking").click();
  await setGridCellValue(page, 2, "date", "01.01.2026");
  await setGridCellValue(page, 2, "account", seeded.investmentsAccount.name);
  await setGridCellValue(page, 2, "debit", "200");
  await page.getByTestId("transaction-modal-submit").click();

  await expect(agGridRowByText(page, "E2E Split Transaction")).toBeVisible();

  await page.reload();
  await expect(agGridRowByText(page, "E2E Split Transaction")).toBeVisible();
});

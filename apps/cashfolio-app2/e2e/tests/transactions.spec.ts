import { expect, test, type Locator, type Page } from "@playwright/test";
import { Unit } from "../../src/.prisma-client/enums";
import {
  agGridCellByColId,
  agGridRowByText,
  clickRowAction,
  setGridCellValue,
} from "../support/grid";
import {
  getTransactionBookingsByDescription,
  resetAndSeedDatabase,
  type SeededData,
} from "../support/db";
import { openDialogFromButton } from "../support/ui";

let seeded: SeededData;

async function openCreateTransaction(page: Page): Promise<Locator> {
  return openDialogFromButton(page, {
    buttonName: "Add Split Transaction",
    dialogName: "Add Transaction",
  });
}

async function openCreateSimpleTransaction(page: Page): Promise<Locator> {
  return openDialogFromButton(page, {
    buttonName: "Add Simple Transaction",
    dialogName: "Add Simple Transaction",
  });
}

async function fillTransactionHeader(dialog: Locator, description: string) {
  await dialog.getByLabel("Date").fill("01.01.2026");
  await dialog.getByLabel("Description").fill(description);
}

test.beforeAll(async () => {
  seeded = await resetAndSeedDatabase();
});

test("create, edit, delete, and create multi-booking transaction", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);

  const createDialog = await openCreateTransaction(page);
  await fillTransactionHeader(createDialog, "E2E Transaction 1");
  await setGridCellValue(page, 0, "credit", "100");
  await setGridCellValue(page, 1, "date", "01.01.2026");
  await setGridCellValue(page, 1, "account", seeded.savingsAccount.name);
  await setGridCellValue(page, 1, "debit", "100");
  await createDialog.getByRole("button", { name: "Create" }).click();

  const createdTransactionRow = agGridRowByText(page, "E2E Transaction 1");
  await expect(createdTransactionRow).toBeVisible();

  await clickRowAction(createdTransactionRow, "Edit");
  await expect(
    page.getByRole("heading", { name: "Edit Transaction" }),
  ).toBeVisible();

  await page.getByLabel("Description").fill("E2E Transaction 1 Updated");
  await page
    .getByRole("dialog", { name: "Edit Transaction" })
    .getByRole("button", { name: "Save" })
    .click();

  const updatedTransactionRow = agGridRowByText(
    page,
    "E2E Transaction 1 Updated",
  );
  await expect(updatedTransactionRow).toBeVisible();

  await clickRowAction(updatedTransactionRow, "Delete");
  await page
    .getByRole("dialog", { name: "Delete Transaction" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(agGridRowByText(page, "E2E Transaction 1 Updated")).toHaveCount(
    0,
  );

  const createSplitDialog = await openCreateTransaction(page);
  await fillTransactionHeader(createSplitDialog, "E2E Split Transaction");
  await setGridCellValue(page, 0, "credit", "300");
  await setGridCellValue(page, 1, "date", "01.01.2026");
  await setGridCellValue(page, 1, "account", seeded.savingsAccount.name);
  await setGridCellValue(page, 1, "debit", "100");
  await page.getByRole("button", { name: "Add booking" }).click();
  await setGridCellValue(page, 2, "date", "01.01.2026");
  await setGridCellValue(page, 2, "account", seeded.investmentsAccount.name);
  await setGridCellValue(page, 2, "debit", "200");
  await createSplitDialog.getByRole("button", { name: "Create" }).click();

  await expect(agGridRowByText(page, "E2E Split Transaction")).toBeVisible();

  await page.reload();
  await expect(agGridRowByText(page, "E2E Split Transaction")).toBeVisible();
});

test("create simple transaction", async ({ page }) => {
  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);

  const simpleDialog = await openCreateSimpleTransaction(page);

  await page.getByLabel("Date").fill("02.01.2026");
  await page.getByLabel("Description").fill("E2E Simple Transaction");
  await page.getByRole("textbox", { name: "Counter account" }).click();
  await page
    .getByRole("option", { name: /E2E Expense/ })
    .first()
    .click();

  await expect(
    simpleDialog.getByRole("button", {
      name: "Swap debit/credit direction",
    }),
  ).toBeDisabled();

  await page.getByLabel("Amount").fill("42");

  await simpleDialog.getByRole("button", { name: "Create" }).click();

  await expect(agGridRowByText(page, "E2E Simple Transaction")).toBeVisible();

  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);
  const cashRow = agGridRowByText(page, seeded.cashAccount.name);
  await expect(agGridCellByColId(cashRow, "balance")).toHaveText("-342.00");
});

test("create security simple transaction preserves account metadata", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/${seeded.securityAccount.id}`);

  const simpleDialog = await openCreateSimpleTransaction(page);

  await page.getByLabel("Date").fill("03.01.2026");
  await page.getByLabel("Description").fill("E2E Security Simple Transaction");
  await page.getByRole("textbox", { name: "Counter account" }).click();
  await page
    .getByRole("option", { name: seeded.securityCounterAccount.name })
    .first()
    .click();
  await page.getByLabel("Amount").fill("3");
  await simpleDialog.getByRole("button", { name: "Create" }).click();

  await expect(
    agGridRowByText(page, "E2E Security Simple Transaction"),
  ).toBeVisible();

  const bookings = await getTransactionBookingsByDescription({
    accountBookId: seeded.accountBookId,
    description: "E2E Security Simple Transaction",
  });
  expect(bookings).toHaveLength(2);

  const bookingByAccountId = new Map(
    bookings.map((booking) => [booking.accountId, booking]),
  );
  const currentBooking = bookingByAccountId.get(seeded.securityAccount.id);
  const counterBooking = bookingByAccountId.get(
    seeded.securityCounterAccount.id,
  );

  expect(currentBooking).toBeDefined();
  expect(counterBooking).toBeDefined();
  expect(currentBooking?.unit).toBe(Unit.SECURITY);
  expect(counterBooking?.unit).toBe(Unit.SECURITY);
  expect(currentBooking?.symbol).toBe("AAPL");
  expect(counterBooking?.symbol).toBe("AAPL");
  expect(currentBooking?.tradeCurrency).toBe("USD");
  expect(counterBooking?.tradeCurrency).toBe("EUR");
});

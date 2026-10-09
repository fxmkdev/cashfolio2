import { Unit } from "../../src/.prisma-client/enums";
import {
  agGridCellByColId,
  agGridRowByText,
  clickRowAction,
  setGridCellValue,
} from "../support/grid";
import {
  getTransactionBookingsByDescription,
  seedDatabase,
  type SeededData,
} from "../support/db";
import { expect, test } from "../support/fixtures";
import {
  expectAccountLeafSearchResult,
  fillTransactionHeader,
  openCreateSimpleTransaction,
  openCreateTransaction,
  selectAccountLeaf,
  setGridAccountCellValue,
} from "../support/transaction-form";

let seeded: SeededData;

test.beforeEach(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
});

test("create, edit, delete, and create multi-booking transaction", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);

  const createDialog = await openCreateTransaction(page);
  await fillTransactionHeader(createDialog, "E2E Transaction 1");
  await setGridCellValue(page, 0, "credit", "100");
  await setGridCellValue(page, 1, "date", "01/01/2026");
  await setGridAccountCellValue({
    dialog: createDialog,
    rowIndex: 1,
    accountName: seeded.savingsAccount.name,
  });
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
  await setGridCellValue(page, 1, "date", "01/01/2026");
  await setGridAccountCellValue({
    dialog: createSplitDialog,
    rowIndex: 1,
    accountName: seeded.savingsAccount.name,
  });
  await setGridCellValue(page, 1, "debit", "100");
  await page.getByRole("button", { name: "Add Booking" }).click();
  await setGridCellValue(page, 2, "date", "01/01/2026");
  await setGridAccountCellValue({
    dialog: createSplitDialog,
    rowIndex: 2,
    accountName: seeded.investmentsAccount.name,
  });
  await setGridCellValue(page, 2, "debit", "200");
  await createSplitDialog.getByRole("button", { name: "Create" }).click();

  await expect(agGridRowByText(page, "E2E Split Transaction")).toBeVisible();

  await page.reload();
  await expect(agGridRowByText(page, "E2E Split Transaction")).toBeVisible();
});

test("create simple transaction", async ({ page }) => {
  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);

  const simpleDialog = await openCreateSimpleTransaction(page);

  await page.getByLabel("Date").fill("01/02/2026");
  await page.getByLabel("Description").fill("E2E Simple Transaction");
  await simpleDialog.getByLabel("Counter Account").click();
  await selectAccountLeaf(page, seeded.expenseAccount.name);

  await expect(
    simpleDialog.getByRole("button", {
      name: "Swap Debit/Credit Direction",
    }),
  ).toBeDisabled();

  await page.getByLabel("Amount").fill("42");

  await simpleDialog.getByRole("button", { name: "Create" }).click();

  await expect(agGridRowByText(page, "E2E Simple Transaction")).toBeVisible();

  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);
  const cashRow = agGridRowByText(page, seeded.cashAccount.name);
  await expect(agGridCellByColId(cashRow, "balance")).toHaveText(/^\s*$/);
  await expect(
    agGridCellByColId(cashRow, "balanceInReferenceCurrency"),
  ).toHaveText("-42.00");
});

test("copy simple transaction keeps source date and saves selected copy date", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);

  const sourceDescription = "E2E Copy Simple Source";
  const copiedDescription = "E2E Copy Simple Result";
  const simpleDialog = await openCreateSimpleTransaction(page);
  await simpleDialog.getByLabel("Date").fill("01/10/2026");
  await simpleDialog.getByLabel("Description").fill(sourceDescription);
  await simpleDialog.getByLabel("Counter Account").click();
  await selectAccountLeaf(page, seeded.expenseAccount.name);
  await simpleDialog.getByLabel("Amount").fill("33");
  await simpleDialog.getByRole("button", { name: "Create" }).click();

  const sourceRow = agGridRowByText(page, sourceDescription);
  await expect(sourceRow).toBeVisible();
  await clickRowAction(sourceRow, "Copy");

  const copyDialog = page.getByRole("dialog", { name: "Copy Transaction" });
  await expect(copyDialog).toBeVisible();

  const dateInput = copyDialog.getByLabel("Date");
  await expect(dateInput).toBeFocused();
  await expect(dateInput).toHaveValue("01/10/2026");

  await dateInput.fill("01/11/2026");
  await copyDialog.getByLabel("Description").fill(copiedDescription);
  await copyDialog.getByRole("button", { name: "Create Copy" }).click();

  await expect(agGridRowByText(page, copiedDescription)).toBeVisible();

  const copiedBookings = await getTransactionBookingsByDescription({
    accountBookId: seeded.accountBookId,
    description: copiedDescription,
  });
  expect(copiedBookings).toHaveLength(2);
  expect(copiedBookings.map((booking) => booking.date)).toEqual([
    "2026-01-11T00:00:00.000Z",
    "2026-01-11T00:00:00.000Z",
  ]);
  expect(
    copiedBookings.map((booking) => booking.value).sort((a, b) => a - b),
  ).toEqual([-33, 33]);
});

test("counterparty account link highlights the matching booking row", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);

  const description = "E2E Counterparty Highlight";
  const simpleDialog = await openCreateSimpleTransaction(page);
  await page.getByLabel("Date").fill("01/03/2026");
  await page.getByLabel("Description").fill(description);
  await simpleDialog.getByLabel("Counter Account").click();
  await selectAccountLeaf(page, seeded.savingsAccount.name);
  await page.getByLabel("Amount").fill("77");
  await simpleDialog.getByRole("button", { name: "Create" }).click();

  const sourceRow = agGridRowByText(page, description);
  await expect(sourceRow).toBeVisible();

  await agGridCellByColId(sourceRow, "counterpartyAccounts")
    .getByRole("link", { name: seeded.savingsAccount.name })
    .first()
    .click();

  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/${seeded.savingsAccount.id}`),
  );

  const targetRow = agGridRowByText(page, description);
  await expect(targetRow).toBeVisible();
  const targetRowHandle = await targetRow.elementHandle();
  expect(targetRowHandle).not.toBeNull();
  await page.waitForFunction(
    (row: HTMLElement | null) =>
      !!row?.querySelector(
        ".ag-cell-data-changed, .ag-cell-data-changed-animation",
      ),
    targetRowHandle,
  );
});

test("rebook booking to another compatible account", async ({ page }) => {
  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);

  const simpleDialog = await openCreateSimpleTransaction(page);
  await page.getByLabel("Date").fill("01/04/2026");
  await page.getByLabel("Description").fill("E2E Rebook Transaction");
  await simpleDialog.getByLabel("Counter Account").click();
  await selectAccountLeaf(page, seeded.savingsAccount.name);
  await simpleDialog
    .getByRole("button", { name: "Swap Debit/Credit Direction" })
    .click();
  await page.getByLabel("Amount").fill("100");
  await simpleDialog.getByRole("button", { name: "Create" }).click();

  const transactionRow = agGridRowByText(page, "E2E Rebook Transaction");
  await expect(transactionRow).toBeVisible();

  await clickRowAction(transactionRow, "Rebook");
  const rebookDialog = page.getByRole("dialog", { name: "Rebook Booking" });
  await expect(rebookDialog).toBeVisible();

  const targetAccountInput = rebookDialog.getByLabel("Target Account");
  await expect(targetAccountInput).toHaveValue("");
  await expectAccountLeafSearchResult({
    input: targetAccountInput,
    page,
    accountName: seeded.investmentsAccount.name,
    visible: true,
  });
  await expectAccountLeafSearchResult({
    input: targetAccountInput,
    page,
    accountName: seeded.cashAccount.name,
    visible: false,
  });
  await expectAccountLeafSearchResult({
    input: targetAccountInput,
    page,
    accountName: seeded.cryptoAccount.name,
    visible: false,
  });
  await expectAccountLeafSearchResult({
    input: targetAccountInput,
    page,
    accountName: seeded.expenseAccount.name,
    visible: false,
  });
  await targetAccountInput.click();
  await selectAccountLeaf(page, seeded.investmentsAccount.name);
  await targetAccountInput.press("Enter");
  await expect(rebookDialog).toBeHidden();

  const bookings = await getTransactionBookingsByDescription({
    accountBookId: seeded.accountBookId,
    description: "E2E Rebook Transaction",
  });

  expect(bookings).toHaveLength(2);
  expect(
    bookings.some((booking) => booking.accountId === seeded.cashAccount.id),
  ).toBe(false);
  expect(bookings.every((booking) => booking.unit === Unit.CURRENCY)).toBe(
    true,
  );
  expect(
    bookings.map((booking) => booking.value).sort((a, b) => a - b),
  ).toEqual([-100, 100]);
});

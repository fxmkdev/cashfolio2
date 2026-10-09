import { agGridCellByColId, agGridRowByText } from "../support/grid";
import {
  getTransactionBookingsByDescription,
  seedDatabase,
  seedThreeBookingSplitTransaction,
  type SeededData,
} from "../support/db";
import { expect, test } from "../support/fixtures";
import {
  openCreateSimpleTransaction,
  openEditTransaction,
  selectAccountLeaf,
  splitCreateDialog,
} from "../support/transaction-form";

let seeded: SeededData;

test.beforeAll(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
});

test("eligible edit opens simple editor and ineligible edit opens split editor", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);

  await openCreateSimpleTransaction(page);
  const simpleCreateDialog = page.getByRole("dialog", {
    name: "Add Transaction",
  });
  await page.getByLabel("Date").fill("01/04/2026");
  await page.getByLabel("Description").fill("E2E Editable Simple");
  await simpleCreateDialog.getByLabel("Counter Account").click();
  await selectAccountLeaf(page, seeded.expenseAccount.name);
  await page.getByLabel("Amount").fill("20");
  await simpleCreateDialog.getByRole("button", { name: "Create" }).click();

  await openEditTransaction(page, "E2E Editable Simple");
  const simpleEditDialog = page.getByRole("dialog", {
    name: "Edit Transaction",
  });
  await expect(
    simpleEditDialog.getByRole("button", { name: "Switch to Split Editor" }),
  ).toBeVisible();
  await expect(simpleEditDialog.getByLabel("Counter Account")).toBeVisible();
  await simpleEditDialog.getByRole("button", { name: "Save" }).click();

  await page.goto(`/${seeded.accountBookId}/${seeded.expenseAccount.id}`);
  await openEditTransaction(page, "E2E Editable Simple");
  const expenseEditDialog = page.getByRole("dialog", {
    name: "Edit Transaction",
  });
  await expect(
    expenseEditDialog.getByRole("button", { name: "Add Booking" }),
  ).toBeVisible();
  await expect(
    expenseEditDialog.getByRole("button", { name: "Switch to Split Editor" }),
  ).toHaveCount(0);
  await expenseEditDialog.getByRole("button", { name: "Cancel" }).click();

  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);
  await seedThreeBookingSplitTransaction({
    accountBookId: seeded.accountBookId,
    description: "E2E Ineligible Split",
    currentAccountId: seeded.cashAccount.id,
    debitAccountIds: [seeded.savingsAccount.id, seeded.investmentsAccount.id],
    date: "2026-01-04T00:00:00.000Z",
  });
  await page.reload();

  await openEditTransaction(page, "E2E Ineligible Split");
  const splitEditDialog = page.getByRole("dialog", {
    name: "Edit Transaction",
  });
  await expect(
    splitEditDialog.getByRole("button", { name: "Add Booking" }),
  ).toBeVisible();
  await splitEditDialog.getByRole("button", { name: "Cancel" }).click();
});

test("switch from simple edit to split carries over edited values", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);

  await openCreateSimpleTransaction(page);
  const simpleCreateDialog = page.getByRole("dialog", {
    name: "Add Transaction",
  });
  await page.getByLabel("Date").fill("01/05/2026");
  await page.getByLabel("Description").fill("E2E Carry Switch");
  await simpleCreateDialog.getByLabel("Counter Account").click();
  await selectAccountLeaf(page, seeded.expenseAccount.name);
  await page.getByLabel("Amount").fill("15");
  await simpleCreateDialog.getByRole("button", { name: "Create" }).click();

  await openEditTransaction(page, "E2E Carry Switch");
  const editDialog = page.getByRole("dialog", {
    name: "Edit Transaction",
  });

  await editDialog.getByLabel("Description").fill("E2E Carry Switch Updated");
  await editDialog.getByLabel("Amount").fill("55");
  await editDialog
    .getByRole("button", { name: "Switch to Split Editor" })
    .click();

  await expect(
    editDialog.getByRole("button", { name: "Add Booking" }),
  ).toBeVisible();
  await expect(editDialog.getByLabel("Description")).toHaveValue(
    "E2E Carry Switch Updated",
  );

  const firstRow = editDialog
    .locator('.ag-grid-scrolling-container > .ag-row[row-index="0"]')
    .first();
  await expect(agGridCellByColId(firstRow, "credit")).toContainText("55");

  await editDialog.getByRole("button", { name: "Save" }).click();
  await expect(agGridRowByText(page, "E2E Carry Switch Updated")).toBeVisible();

  const bookings = await getTransactionBookingsByDescription({
    accountBookId: seeded.accountBookId,
    description: "E2E Carry Switch Updated",
  });
  expect(bookings).toHaveLength(2);

  const bookingByAccountId = new Map(
    bookings.map((booking) => [booking.accountId, booking]),
  );
  expect(bookingByAccountId.get(seeded.cashAccount.id)?.value).toBe(-55);
  expect(bookingByAccountId.get(seeded.expenseAccount.id)?.value).toBe(55);
});

test("create flow: changing date before switching to split still allows split create", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);

  const simpleDialog = await openCreateSimpleTransaction(page);
  await simpleDialog.getByLabel("Date").fill("01/06/2026");
  await simpleDialog.getByLabel("Description").fill("E2E Create Date Switch");
  await simpleDialog.getByLabel("Counter Account").click();
  await selectAccountLeaf(page, seeded.expenseAccount.name);
  await simpleDialog.getByLabel("Amount").fill("22");

  await simpleDialog
    .getByRole("button", { name: "Switch to Split Editor" })
    .click();

  const splitDialog = splitCreateDialog(page);
  await expect(splitDialog).toBeVisible();
  await expect(splitDialog.getByLabel("Description")).toHaveValue(
    "E2E Create Date Switch",
  );

  await splitDialog.getByLabel("Date").fill("01/07/2026");

  const splitRow0 = splitDialog
    .locator('.ag-grid-scrolling-container > .ag-row[row-index="0"]')
    .first();
  await expect(agGridCellByColId(splitRow0, "date")).toContainText("1/7/2026");

  await splitDialog.getByRole("button", { name: "Create" }).click();
  await expect(agGridRowByText(page, "E2E Create Date Switch")).toBeVisible();
});

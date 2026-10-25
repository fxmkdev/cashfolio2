import { Unit } from "../../src/.prisma-client/enums";
import {
  agGridCellByColId,
  agGridRowByText,
  setGridCellValue,
} from "../support/grid";
import {
  getTransactionBookingsByDescription,
  seedDatabase,
  type SeededData,
} from "../support/db";
import { expect, test } from "../support/fixtures";
import {
  gridRowByIndex,
  openCreateSimpleTransaction,
  openCreateTransaction,
  openEditTransaction,
  selectAccountLeaf,
  setGridAccountCellValue,
  setUnitlessEquityAccountOnEditableRow,
} from "../support/transaction-form";

let seeded: SeededData;

test.beforeAll(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
});

test("create security simple transaction preserves account metadata", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/${seeded.securityAccount.id}`);

  const simpleDialog = await openCreateSimpleTransaction(page);

  await page.getByLabel("Date").fill("01/03/2026");
  await page.getByLabel("Description").fill("E2E Security Simple Transaction");
  await simpleDialog.getByLabel("Account or Category").click();
  await selectAccountLeaf(page, seeded.securityCounterAccount.name);
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

  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);

  const usdSecurityRow = agGridRowByText(page, seeded.securityAccount.name);
  await expect(agGridCellByColId(usdSecurityRow, "balance")).toHaveText("3");
  await expect(
    agGridCellByColId(usdSecurityRow, "balanceInReferenceCurrency"),
  ).toHaveText("15.00");

  const eurSecurityRow = agGridRowByText(
    page,
    seeded.securityCounterAccount.name,
  );
  await expect(agGridCellByColId(eurSecurityRow, "balance")).toHaveText("-3");
  await expect(
    agGridCellByColId(eurSecurityRow, "balanceInReferenceCurrency"),
  ).toHaveText(/^-13\.6[34]$/);
});

test("split dialogs default empty equity bookings and preserve existing unit metadata", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);

  const createDialog = await openCreateTransaction(page);
  await createDialog.getByLabel("Date").fill("01/08/2026");
  await createDialog
    .getByLabel("Description")
    .fill("E2E Unitless Equity Create");
  await setGridCellValue(createDialog, 0, "credit", "90");

  const createCounterRow = createDialog
    .locator('.ag-grid-scrolling-container > .ag-row[row-index="1"]')
    .first();
  await expect(agGridCellByColId(createCounterRow, "unit")).toHaveText("");
  await expect(agGridCellByColId(createCounterRow, "ccy")).toHaveText("");
  await setGridAccountCellValue({
    dialog: createDialog,
    rowIndex: 1,
    accountName: seeded.unitlessEquityAccount.name,
  });
  await expect(agGridCellByColId(createCounterRow, "unit")).toContainText(
    "Currency",
  );
  await expect(agGridCellByColId(createCounterRow, "ccy")).toContainText("CHF");
  await setGridCellValue(createDialog, 1, "debit", "90");

  await createDialog.getByRole("button", { name: "Create" }).click();
  await expect(
    agGridRowByText(page, "E2E Unitless Equity Create"),
  ).toBeVisible();

  await page.goto(`/${seeded.accountBookId}/${seeded.securityAccount.id}`);

  const securitySimpleDialog = await openCreateSimpleTransaction(page);
  await securitySimpleDialog.getByLabel("Date").fill("01/09/2026");
  await securitySimpleDialog
    .getByLabel("Description")
    .fill("E2E Unitless Equity Edit");
  await securitySimpleDialog.getByLabel("Account or Category").click();
  await selectAccountLeaf(page, seeded.securityCounterAccount.name);
  await securitySimpleDialog.getByLabel("Amount").fill("5");
  await securitySimpleDialog.getByRole("button", { name: "Create" }).click();
  await expect(agGridRowByText(page, "E2E Unitless Equity Edit")).toBeVisible();

  await openEditTransaction(page, "E2E Unitless Equity Edit");
  const editDialog = page.getByRole("dialog", { name: "Edit Transaction" });
  await editDialog
    .getByRole("button", { name: "Switch to Split Editor" })
    .click();
  await expect(
    editDialog.getByRole("button", { name: "Add Booking" }),
  ).toBeVisible();
  const { editedRowIndex, lockedRowIndex } =
    await setUnitlessEquityAccountOnEditableRow({
      dialog: editDialog,
      accountName: seeded.unitlessEquityAccount.name,
    });
  const lockedRow = gridRowByIndex(editDialog, lockedRowIndex);
  await expect(agGridCellByColId(lockedRow, "ccy")).toHaveText("USD");
  const editedRow = gridRowByIndex(editDialog, editedRowIndex);
  await expect(agGridCellByColId(editedRow, "unit")).toHaveText("Security");
  await expect(agGridCellByColId(editedRow, "symbol")).toHaveText("AAPL");
  await expect(agGridCellByColId(editedRow, "ccy")).toHaveText("EUR");

  await editDialog.getByRole("button", { name: "Save" }).click();
  await expect(agGridRowByText(page, "E2E Unitless Equity Edit")).toBeVisible();

  await expect
    .poll(
      () =>
        getTransactionBookingsByDescription({
          accountBookId: seeded.accountBookId,
          description: "E2E Unitless Equity Edit",
        }),
      {
        timeout: 10_000,
      },
    )
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: seeded.unitlessEquityAccount.id,
          unit: Unit.SECURITY,
          symbol: "AAPL",
          tradeCurrency: "EUR",
          value: -5,
        }),
        expect.objectContaining({
          accountId: seeded.securityAccount.id,
          unit: Unit.SECURITY,
          symbol: "AAPL",
          tradeCurrency: "USD",
          value: 5,
        }),
      ]),
    );
});

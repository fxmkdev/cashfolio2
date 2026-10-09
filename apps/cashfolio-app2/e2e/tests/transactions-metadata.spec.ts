import { Unit } from "../../src/.prisma-client/enums";
import { agGridCellByColId, agGridRowByText } from "../support/grid";
import {
  getTransactionBookingsByDescription,
  seedDatabase,
  type SeededData,
} from "../support/db";
import { expect, test } from "../support/fixtures";
import {
  gridRowByIndex,
  openCreateSimpleTransaction,
  openEditTransaction,
  selectAccountLeaf,
  setGridAccountCellValue,
  setUnitlessEquityAccountOnEditableRow,
  splitCreateDialog,
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
  await simpleDialog.getByLabel("Counter Account").click();
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

test("split dialogs auto-fill unit metadata for unitless equity account selection", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);

  const createSimpleDialog = await openCreateSimpleTransaction(page);
  await createSimpleDialog.getByLabel("Date").fill("01/08/2026");
  await createSimpleDialog
    .getByLabel("Description")
    .fill("E2E Unitless Equity Create");
  await createSimpleDialog.getByLabel("Counter Account").click();
  await selectAccountLeaf(page, seeded.savingsAccount.name);
  await createSimpleDialog.getByLabel("Amount").fill("90");
  await createSimpleDialog
    .getByRole("button", { name: "Switch to Split Editor" })
    .click();

  const createDialog = splitCreateDialog(page);
  await expect(createDialog).toBeVisible();

  const createCounterRow = createDialog
    .locator('.ag-grid-scrolling-container > .ag-row[row-index="1"]')
    .first();
  await setGridAccountCellValue({
    dialog: createDialog,
    rowIndex: 1,
    accountName: seeded.unitlessEquityAccount.name,
  });
  await expect(agGridCellByColId(createCounterRow, "unit")).toContainText(
    "Currency",
  );
  await expect(agGridCellByColId(createCounterRow, "ccy")).toContainText("CHF");

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
  await securitySimpleDialog.getByLabel("Counter Account").click();
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
  const expectedUnit = (
    await agGridCellByColId(lockedRow, "unit").innerText()
  ).trim();
  const expectedSymbol = (
    await agGridCellByColId(lockedRow, "symbol").innerText()
  ).trim();
  const expectedCcy = (
    await agGridCellByColId(lockedRow, "ccy").innerText()
  ).trim();
  const editedRow = gridRowByIndex(editDialog, editedRowIndex);
  await expect(agGridCellByColId(editedRow, "unit")).toContainText(
    expectedUnit,
  );
  await expect(agGridCellByColId(editedRow, "symbol")).toContainText(
    expectedSymbol,
  );
  await expect(agGridCellByColId(editedRow, "ccy")).toContainText(expectedCcy);

  await editDialog.getByRole("button", { name: "Save" }).click();
  await expect(agGridRowByText(page, "E2E Unitless Equity Edit")).toBeVisible();

  await expect
    .poll(
      async () => {
        const bookings = await getTransactionBookingsByDescription({
          accountBookId: seeded.accountBookId,
          description: "E2E Unitless Equity Edit",
        });
        const unitlessEquityBooking = bookings.find(
          (booking) => booking.accountId === seeded.unitlessEquityAccount.id,
        );
        const lockedBooking = bookings.find(
          (booking) => booking.accountId !== seeded.unitlessEquityAccount.id,
        );
        if (!unitlessEquityBooking || !lockedBooking) {
          return false;
        }

        return (
          unitlessEquityBooking.unit === lockedBooking.unit &&
          unitlessEquityBooking.symbol === lockedBooking.symbol &&
          unitlessEquityBooking.tradeCurrency === lockedBooking.tradeCurrency &&
          unitlessEquityBooking.value === -lockedBooking.value
        );
      },
      {
        timeout: 10_000,
      },
    )
    .toBe(true);
});

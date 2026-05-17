import { Unit } from "../../src/.prisma-client/enums";
import {
  agGridCellByColId,
  agGridRowByText,
  setGridCellValue,
} from "../support/grid";
import {
  getTransactionBookingsByDescription,
  seedTransactionsPageScenario,
  seedDatabase,
  type SeededData,
} from "../support/db";
import { expect, test, type Locator, type Page } from "../support/fixtures";

let seeded: SeededData;

function accountOptionNameRegex(name: string): RegExp {
  return new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

function accountLeafOption(page: Page, name: string): Locator {
  return page
    .getByRole("option", {
      name: accountOptionNameRegex(name),
    })
    .filter({ hasNot: page.getByRole("button") })
    .first();
}

async function selectAccountLeaf(page: Page, name: string) {
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(name);
  const option = accountLeafOption(page, name);
  await expect(option).toBeVisible();
  await option.click();
}

async function setGridAccountCellValue(args: {
  dialog: Locator;
  rowIndex: number;
  accountName: string;
}) {
  const cell = args.dialog
    .locator(
      `.ag-center-cols-container .ag-row[row-index="${args.rowIndex}"] [col-id="account"]`,
    )
    .first();

  await expect(cell).toBeVisible();
  await cell.click({ force: true });

  let editorInput = args.dialog
    .locator(".ag-cell-inline-editing input:not([type='hidden'])")
    .first();
  if (!(await editorInput.isVisible())) {
    await cell.press("Enter");
    editorInput = args.dialog
      .locator(".ag-cell-inline-editing input:not([type='hidden'])")
      .first();
  }

  await expect(editorInput).toBeVisible();
  await editorInput.fill(args.accountName);
  await selectAccountLeaf(args.dialog.page(), args.accountName);
  await args.dialog.page().keyboard.press("Enter");
}

async function rowIndex(row: Locator): Promise<number> {
  const index = await row.getAttribute("row-index");
  expect(index).not.toBeNull();
  return Number(index);
}

test.beforeAll(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
});

test("lists bookings, carries account link context, and creates transactions", async ({
  page,
}) => {
  const scenario = await seedTransactionsPageScenario({
    accountBookId: seeded.accountBookId,
    cashAccountId: seeded.cashAccount.id,
    savingsAccountId: seeded.savingsAccount.id,
    expenseAccountId: seeded.expenseAccount.id,
  });

  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);
  await page.getByRole("link", { name: "Transactions" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/transactions`),
  );
  await expect(
    page.getByRole("heading", { name: "Transactions" }),
  ).toBeVisible();
  await expect(page.getByTestId("period-picker-trigger")).toContainText(
    "May 2026",
  );

  const newerCashRow = agGridRowByText(
    page,
    `${scenario.newerDescription} Cash`,
  );
  const olderCashRow = agGridRowByText(
    page,
    `${scenario.olderDescription} Cash`,
  );
  await expect(newerCashRow).toBeVisible();
  await expect(olderCashRow).toBeVisible();
  expect(await rowIndex(newerCashRow)).toBeLessThan(
    await rowIndex(olderCashRow),
  );
  await expect(agGridCellByColId(newerCashRow, "debit")).toContainText(
    "125.00",
  );
  await expect(agGridCellByColId(newerCashRow, "credit")).toHaveText("");

  await agGridCellByColId(newerCashRow, "account")
    .getByRole("link", { name: seeded.cashAccount.name })
    .click();

  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/${seeded.cashAccount.id}`),
  );
  const ledgerUrl = new URL(page.url());
  expect(ledgerUrl.searchParams.get("period")).toBe("2026-05");
  expect(ledgerUrl.searchParams.get("transactionId")).toBe(
    scenario.newerTransactionId,
  );
  await expect(
    agGridRowByText(page, `${scenario.newerDescription} Cash`),
  ).toBeVisible();

  await page.goto(`/${seeded.accountBookId}/transactions?period=2026-05`);
  await page.getByRole("button", { name: "Add Transaction" }).click();
  const createDialog = page.getByRole("dialog", { name: "Add Transaction" });
  await expect(createDialog).toBeVisible();
  await expect(
    createDialog.getByRole("button", { name: "Add Booking" }),
  ).toBeVisible();

  const createdDescription = "E2E Transactions Created";
  await createDialog.getByLabel("Date").fill("05/13/2026");
  await createDialog.getByLabel("Description").fill(createdDescription);
  await setGridCellValue(createDialog, 0, "date", "05/13/2026");
  await setGridAccountCellValue({
    dialog: createDialog,
    rowIndex: 0,
    accountName: seeded.cashAccount.name,
  });
  await setGridCellValue(createDialog, 0, "credit", "88");
  await setGridCellValue(createDialog, 1, "date", "05/13/2026");
  await setGridAccountCellValue({
    dialog: createDialog,
    rowIndex: 1,
    accountName: seeded.expenseAccount.name,
  });
  await setGridCellValue(createDialog, 1, "debit", "88");
  await createDialog.getByRole("button", { name: "Create" }).click();

  await expect(agGridRowByText(page, createdDescription)).toBeVisible();
  const bookings = await getTransactionBookingsByDescription({
    accountBookId: seeded.accountBookId,
    description: createdDescription,
  });
  expect(bookings).toHaveLength(2);
  expect(bookings.every((booking) => booking.unit === Unit.CURRENCY)).toBe(
    true,
  );
  expect(
    bookings.map((booking) => booking.value).sort((a, b) => a - b),
  ).toEqual([-88, 88]);
});

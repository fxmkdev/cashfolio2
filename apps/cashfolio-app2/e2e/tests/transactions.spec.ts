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
  seedDatabase,
  seedThreeBookingSplitTransaction,
  type SeededData,
} from "../support/db";

let seeded: SeededData;

function simpleCreateDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Add Transaction" }).filter({
    has: page.getByRole("button", { name: "Switch to split editor" }),
  });
}

function splitCreateDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Add Transaction" }).filter({
    has: page.getByRole("button", { name: "Add booking" }),
  });
}

async function opensWithin(
  locator: Locator,
  timeout: number,
): Promise<boolean> {
  try {
    await expect(locator).toBeVisible({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function openAddTransactionDialog(
  page: Page,
): Promise<"SIMPLE" | "SPLIT"> {
  const button = page.getByRole("button", { name: "Add Transaction" });
  await expect(button).toBeVisible();

  const simpleDialog = simpleCreateDialog(page);
  const splitDialog = splitCreateDialog(page);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await button.click();
    if (await opensWithin(simpleDialog, 1500)) {
      return "SIMPLE";
    }
    if (await opensWithin(splitDialog, 1500)) {
      return "SPLIT";
    }
  }

  await expect(simpleDialog.or(splitDialog)).toBeVisible();
  return (await simpleDialog.isVisible()) ? "SIMPLE" : "SPLIT";
}

async function openCreateTransaction(page: Page): Promise<Locator> {
  const openedVariant = await openAddTransactionDialog(page);
  const splitDialog = splitCreateDialog(page);
  if (openedVariant === "SPLIT") {
    await expect(splitDialog).toBeVisible();
    return splitDialog;
  }

  const simpleDialog = simpleCreateDialog(page);
  await simpleDialog
    .getByRole("button", { name: "Switch to split editor" })
    .click();
  await expect(simpleDialog).toHaveCount(0);
  await expect(splitDialog).toBeVisible();
  return splitDialog;
}

async function openCreateSimpleTransaction(page: Page): Promise<Locator> {
  const openedVariant = await openAddTransactionDialog(page);
  expect(openedVariant).toBe("SIMPLE");
  const simpleDialog = simpleCreateDialog(page);
  await expect(simpleDialog).toBeVisible();
  return simpleDialog;
}

async function fillTransactionHeader(dialog: Locator, description: string) {
  await dialog.getByLabel("Date").fill("01.01.2026");
  await dialog.getByLabel("Description").fill(description);
}

async function openEditTransaction(page: Page, description: string) {
  const row = agGridRowByText(page, description);
  await clickRowAction(row, "Edit");
  await expect(
    page.getByRole("heading", { name: "Edit Transaction" }),
  ).toBeVisible();
}

function assetAccountOptionLabel(name: string): string {
  return `Asset / Assets / ${name}`;
}

function accountOptionNameRegex(name: string): RegExp {
  return new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

test.beforeAll(async () => {
  seeded = await seedDatabase();
});

test("create, edit, delete, and create multi-booking transaction", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);

  const createDialog = await openCreateTransaction(page);
  await fillTransactionHeader(createDialog, "E2E Transaction 1");
  await setGridCellValue(page, 0, "credit", "100");
  await setGridCellValue(page, 1, "date", "01.01.2026");
  await setGridCellValue(
    page,
    1,
    "account",
    assetAccountOptionLabel(seeded.savingsAccount.name),
  );
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
  await setGridCellValue(
    page,
    1,
    "account",
    assetAccountOptionLabel(seeded.savingsAccount.name),
  );
  await setGridCellValue(page, 1, "debit", "100");
  await page.getByRole("button", { name: "Add booking" }).click();
  await setGridCellValue(page, 2, "date", "01.01.2026");
  await setGridCellValue(
    page,
    2,
    "account",
    assetAccountOptionLabel(seeded.investmentsAccount.name),
  );
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
  await simpleDialog.getByRole("combobox", { name: "Counter account" }).click();
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

test("counterparty account link highlights the matching booking row", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);

  const description = "E2E Counterparty Highlight";
  const simpleDialog = await openCreateSimpleTransaction(page);
  await page.getByLabel("Date").fill("03.01.2026");
  await page.getByLabel("Description").fill(description);
  await simpleDialog.getByRole("combobox", { name: "Counter account" }).click();
  await page
    .getByRole("option", {
      name: accountOptionNameRegex(seeded.savingsAccount.name),
    })
    .first()
    .click();
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
  await page.getByLabel("Date").fill("04.01.2026");
  await page.getByLabel("Description").fill("E2E Rebook Transaction");
  await simpleDialog.getByRole("combobox", { name: "Counter account" }).click();
  await page
    .getByRole("option", {
      name: accountOptionNameRegex(seeded.savingsAccount.name),
    })
    .first()
    .click();
  await simpleDialog
    .getByRole("button", { name: "Swap debit/credit direction" })
    .click();
  await page.getByLabel("Amount").fill("100");
  await simpleDialog.getByRole("button", { name: "Create" }).click();

  const transactionRow = agGridRowByText(page, "E2E Rebook Transaction");
  await expect(transactionRow).toBeVisible();

  await clickRowAction(transactionRow, "Rebook");
  const rebookDialog = page.getByRole("dialog", { name: "Rebook Booking" });
  await expect(rebookDialog).toBeVisible();

  const targetAccountInput = rebookDialog.getByRole("combobox", {
    name: "Target account",
  });
  await expect(targetAccountInput).toHaveValue("");
  await targetAccountInput.click();
  await expect(
    page
      .getByRole("option", {
        name: accountOptionNameRegex(seeded.investmentsAccount.name),
      })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("option", {
      name: accountOptionNameRegex(seeded.cashAccount.name),
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("option", {
      name: accountOptionNameRegex(seeded.cryptoAccount.name),
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("option", {
      name: accountOptionNameRegex(seeded.expenseAccount.name),
    }),
  ).toHaveCount(0);
  await page
    .getByRole("option", {
      name: accountOptionNameRegex(seeded.investmentsAccount.name),
    })
    .first()
    .click();
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

test("eligible edit opens simple editor and ineligible edit opens split editor", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);

  await openCreateSimpleTransaction(page);
  const simpleCreateDialog = page.getByRole("dialog", {
    name: "Add Transaction",
  });
  await page.getByLabel("Date").fill("04.01.2026");
  await page.getByLabel("Description").fill("E2E Editable Simple");
  await simpleCreateDialog
    .getByRole("combobox", { name: "Counter account" })
    .click();
  await page
    .getByRole("option", {
      name: accountOptionNameRegex(seeded.expenseAccount.name),
    })
    .first()
    .click();
  await page.getByLabel("Amount").fill("20");
  await simpleCreateDialog.getByRole("button", { name: "Create" }).click();

  await openEditTransaction(page, "E2E Editable Simple");
  const simpleEditDialog = page.getByRole("dialog", {
    name: "Edit Transaction",
  });
  await expect(
    simpleEditDialog.getByRole("button", { name: "Switch to split editor" }),
  ).toBeVisible();
  await expect(
    simpleEditDialog.getByRole("combobox", { name: "Counter account" }),
  ).toBeVisible();
  await simpleEditDialog.getByRole("button", { name: "Save" }).click();

  await page.goto(`/${seeded.accountBookId}/${seeded.expenseAccount.id}`);
  await openEditTransaction(page, "E2E Editable Simple");
  const expenseEditDialog = page.getByRole("dialog", {
    name: "Edit Transaction",
  });
  await expect(
    expenseEditDialog.getByRole("button", { name: "Add booking" }),
  ).toBeVisible();
  await expect(
    expenseEditDialog.getByRole("button", { name: "Switch to split editor" }),
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
    splitEditDialog.getByRole("button", { name: "Add booking" }),
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
  await page.getByLabel("Date").fill("05.01.2026");
  await page.getByLabel("Description").fill("E2E Carry Switch");
  await simpleCreateDialog
    .getByRole("combobox", { name: "Counter account" })
    .click();
  await page
    .getByRole("option", {
      name: accountOptionNameRegex(seeded.expenseAccount.name),
    })
    .first()
    .click();
  await page.getByLabel("Amount").fill("15");
  await simpleCreateDialog.getByRole("button", { name: "Create" }).click();

  await openEditTransaction(page, "E2E Carry Switch");
  const editDialog = page.getByRole("dialog", {
    name: "Edit Transaction",
  });

  await editDialog.getByLabel("Description").fill("E2E Carry Switch Updated");
  await editDialog.getByLabel("Amount").fill("55");
  await editDialog
    .getByRole("button", { name: "Switch to split editor" })
    .click();

  await expect(
    editDialog.getByRole("button", { name: "Add booking" }),
  ).toBeVisible();
  await expect(editDialog.getByLabel("Description")).toHaveValue(
    "E2E Carry Switch Updated",
  );

  const firstRow = editDialog
    .locator('.ag-center-cols-container .ag-row[row-index="0"]')
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
  await simpleDialog.getByLabel("Date").fill("06.01.2026");
  await simpleDialog.getByLabel("Description").fill("E2E Create Date Switch");
  await simpleDialog.getByRole("combobox", { name: "Counter account" }).click();
  await page
    .getByRole("option", {
      name: accountOptionNameRegex(seeded.expenseAccount.name),
    })
    .first()
    .click();
  await simpleDialog.getByLabel("Amount").fill("22");

  await simpleDialog
    .getByRole("button", { name: "Switch to split editor" })
    .click();

  const splitDialog = splitCreateDialog(page);
  await expect(splitDialog).toBeVisible();
  await expect(splitDialog.getByLabel("Description")).toHaveValue(
    "E2E Create Date Switch",
  );

  await splitDialog.getByLabel("Date").fill("07.01.2026");

  const splitRow0 = splitDialog
    .locator('.ag-center-cols-container .ag-row[row-index="0"]')
    .first();
  await expect(agGridCellByColId(splitRow0, "date")).toContainText(
    "07.01.2026",
  );

  await splitDialog.getByRole("button", { name: "Create" }).click();
  await expect(agGridRowByText(page, "E2E Create Date Switch")).toBeVisible();
});

test("create security simple transaction preserves account metadata", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/${seeded.securityAccount.id}`);

  const simpleDialog = await openCreateSimpleTransaction(page);

  await page.getByLabel("Date").fill("03.01.2026");
  await page.getByLabel("Description").fill("E2E Security Simple Transaction");
  await simpleDialog.getByRole("combobox", { name: "Counter account" }).click();
  await page
    .getByRole("option", {
      name: accountOptionNameRegex(seeded.securityCounterAccount.name),
    })
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

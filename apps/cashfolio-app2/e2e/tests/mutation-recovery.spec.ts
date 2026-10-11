import { Buffer } from "node:buffer";
import { createId } from "@paralleldrive/cuid2";
import { expect, test, type Page } from "../support/fixtures";
import {
  seedDatabase,
  type SeededData,
  countTransactionsByDescription,
} from "../support/db";
import { prisma } from "../support/db-client";
import {
  agGridRowByText,
  agGridCellByColId,
  clickRowAction,
  setGridAccountTreeCellValue,
} from "../support/grid";
import {
  openCreateSimpleTransaction,
  selectAccountLeaf,
} from "../support/transaction-form";

let seeded: SeededData;
test.beforeEach(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
});
async function fillDraft(page: Page, description: string) {
  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);
  const dialog = await openCreateSimpleTransaction(page);
  await dialog.getByLabel("Date").fill("01/04/2026");
  await dialog.getByLabel("Description").fill(description);
  await dialog.getByLabel("Amount").fill("20");
  await dialog.getByLabel("Counter Account").click();
  await selectAccountLeaf(page, seeded.expenseAccount.name);
  return dialog;
}

test("a changed start date rejects an open draft without losing its inputs", async ({
  page,
}) => {
  const description = "Rejected date draft";
  const dialog = await fillDraft(page, description);
  const date = await dialog.getByLabel("Date").inputValue();
  await prisma.accountBook.update({
    where: { id: seeded.accountBookId },
    data: { startDate: new Date("2026-02-01") },
  });
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Date cannot be before account book start date",
  );
  await expect(dialog.getByLabel("Description")).toHaveValue(description);
  await expect(dialog.getByLabel("Date")).toHaveValue(date);
  await expect(dialog.getByLabel("Amount")).toHaveValue("20");
  await expect(
    dialog.getByRole("button", { name: "Refresh choices" }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Refresh choices" }).click();
  await expect(dialog.getByLabel("Description")).toHaveValue(description);
  expect(
    await countTransactionsByDescription({
      accountBookId: seeded.accountBookId,
      description,
    }),
  ).toBe(0);
  await dialog.getByLabel("Date").fill("02/04/2026");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    await countTransactionsByDescription({
      accountBookId: seeded.accountBookId,
      description,
    }),
  ).toBe(1);
});

test("an archived counter account remains visible until the draft is corrected", async ({
  page,
}) => {
  const description = "Archived choice draft";
  const dialog = await fillDraft(page, description);
  await prisma.account.update({
    where: {
      id_accountBookId: {
        id: seeded.expenseAccount.id,
        accountBookId: seeded.accountBookId,
      },
    },
    data: { isActive: false },
  });
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Description")).toHaveValue(description);
  await expect(dialog.getByLabel("Counter Account")).toHaveValue(
    seeded.expenseAccount.name,
  );
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    dialog.getByText(
      "The selected account is no longer available. Choose another account.",
    ),
  ).toBeVisible();
  expect(
    await countTransactionsByDescription({
      accountBookId: seeded.accountBookId,
      description,
    }),
  ).toBe(0);
  await dialog.getByLabel("Counter Account").click();
  await selectAccountLeaf(page, seeded.savingsAccount.name);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

for (const action of ["Archive", "Delete"] as const) {
  test(`${action.toLowerCase()} rejection keeps the confirmation open with recovery feedback`, async ({
    page,
  }) => {
    const id = createId();
    const name = `Concurrent ${action}`;
    await prisma.account.create({
      data: {
        id,
        name,
        type: "ASSET",
        unit: "CURRENCY",
        currency: "CHF",
        accountBookId: seeded.accountBookId,
      },
    });
    await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET`);
    await clickRowAction(agGridRowByText(page, name), action);
    const dialog = page.getByRole("dialog", {
      name: `${action} Account`,
      exact: true,
    });
    await expect(dialog).toBeVisible();
    const transactionId = createId();
    await prisma.transaction.create({
      data: {
        id: transactionId,
        accountBookId: seeded.accountBookId,
        description: "Concurrent booking",
        bookings: {
          create: [
            {
              id: createId(),
              accountId: id,
              date: new Date("2026-04-01"),
              description: "",
              value: "10",
              unit: "CURRENCY",
              currency: "CHF",
            },
            {
              id: createId(),
              accountId: seeded.cashAccount.id,
              date: new Date("2026-04-01"),
              description: "",
              value: "-10",
              unit: "CURRENCY",
              currency: "CHF",
            },
          ],
        },
      },
    });
    await dialog.getByRole("button", { name: action, exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      action === "Archive" ? /balance/i : /booking/i,
    );
    await expect(
      dialog.getByRole("button", { name: "Refresh choices" }),
    ).toBeEnabled();
    const account = await prisma.account.findUniqueOrThrow({
      where: { id_accountBookId: { id, accountBookId: seeded.accountBookId } },
    });
    expect(account.isActive).toBe(true);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
}

test("a rejected import retains edited review rows and inclusion choices", async ({
  page,
}) => {
  await page.goto(
    `/${seeded.accountBookId}/${seeded.cashAccount.id}/import-statement`,
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: "draft.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "date,amount,original amount,original currency,exchange rate,description\n2026-04-01,-10,,,,Retained review\n2026-04-02,-20,,,,Excluded review",
    ),
  });
  const row = agGridRowByText(page, "Retained review");
  await expect(row).toBeVisible();
  await setGridAccountTreeCellValue({
    root: page,
    rowIndex: Number(await row.getAttribute("row-index")),
    colId: "counterAccountId",
    accountName: seeded.expenseAccount.name,
  });
  // Exclude the second row while retaining the first row's counter-account edit.
  await agGridRowByText(page, "Excluded review").getByRole("checkbox").click();
  await expect(
    page.getByRole("button", { name: "Import Transactions", exact: true }),
  ).toBeEnabled();
  await prisma.accountBook.update({
    where: { id: seeded.accountBookId },
    data: { startDate: new Date("2026-05-01") },
  });
  await page
    .getByRole("button", { name: "Import Transactions", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Date cannot be before account book start date",
  );
  await expect(page).toHaveURL(/import-statement/);
  await expect(agGridCellByColId(row, "counterAccountId")).toContainText(
    seeded.expenseAccount.name,
  );
  await expect(row.getByRole("checkbox")).toBeChecked();
  await expect(
    agGridRowByText(page, "Excluded review").getByRole("checkbox"),
  ).not.toBeChecked();
  await expect(agGridCellByColId(row, "status")).toContainText("Error");
  expect(
    await countTransactionsByDescription({
      accountBookId: seeded.accountBookId,
      description: "Retained review",
    }),
  ).toBe(0);
  await expect(
    page.getByRole("button", { name: "Import Transactions", exact: true }),
  ).toBeDisabled();
});

for (const entity of ["account", "group"] as const) {
  test(`a refreshed ${entity} form retains its unsaved name`, async ({
    page,
  }) => {
    const id = createId();
    const original = `Original ${entity}`;
    const duplicate = `Unsaved ${entity}`;
    const model = entity === "account" ? prisma.account : prisma.accountGroup;
    const data = {
      id,
      name: original,
      accountBookId: seeded.accountBookId,
      type: "ASSET" as const,
    };
    if (entity === "account")
      await prisma.account.create({
        data: { ...data, unit: "CURRENCY", currency: "CHF" },
      });
    else await prisma.accountGroup.create({ data });
    await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET`);
    await clickRowAction(agGridRowByText(page, original), "Edit");
    const dialog = page.getByRole("dialog", {
      name: entity === "account" ? "Edit Account" : "Edit Group",
    });
    await dialog.getByLabel("Name").fill(duplicate);
    // Another writer creates the sibling after the form's validation snapshot.
    if (entity === "account")
      await prisma.account.create({
        data: {
          ...data,
          id: createId(),
          name: duplicate,
          unit: "CURRENCY",
          currency: "CHF",
        },
      });
    else
      await prisma.accountGroup.create({
        data: { ...data, id: createId(), name: duplicate },
      });
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText(/already exists/i);
    await expect(
      dialog.getByRole("button", { name: "Refresh choices" }),
    ).toBeEnabled();
    await expect(dialog.getByLabel("Name")).toHaveValue(duplicate);
    await dialog.getByRole("button", { name: "Refresh choices" }).click();
    await expect(dialog.getByLabel("Name")).toHaveValue(duplicate);
    expect(
      await model.count({
        where: { id, name: original, accountBookId: seeded.accountBookId },
      }),
    ).toBe(1);
  });
}

test("a rejected split draft retains both booking rows", async ({ page }) => {
  const description = "Retained split draft";
  const simple = await fillDraft(page, description);
  await simple.getByRole("button", { name: "Switch to Split Editor" }).click();
  const dialog = page
    .getByRole("dialog", { name: "Add Transaction" })
    .filter({ has: page.getByRole("button", { name: "Add Booking" }) });
  const bookingRows = dialog.locator(".ag-grid-scrolling-container > .ag-row");
  await expect(bookingRows).toHaveCount(2);
  const before = await bookingRows.allTextContents();
  await prisma.accountBook.update({
    where: { id: seeded.accountBookId },
    data: { startDate: new Date("2026-02-01") },
  });
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Date cannot be before account book start date",
  );
  await expect(
    dialog.getByRole("button", { name: "Refresh choices" }),
  ).toBeEnabled();
  await expect(dialog.getByLabel("Description", { exact: true })).toHaveValue(
    description,
  );
  expect(await bookingRows.allTextContents()).toEqual(before);
  expect(
    await countTransactionsByDescription({
      accountBookId: seeded.accountBookId,
      description,
    }),
  ).toBe(0);
});

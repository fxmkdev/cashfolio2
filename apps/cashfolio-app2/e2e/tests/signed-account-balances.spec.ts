import { Buffer } from "node:buffer";
import {
  seedDatabase,
  getTransactionBookingsByDescription,
  type SeededData,
} from "../support/db";
import { prisma } from "../support/db-client";
import { expect, test } from "../support/fixtures";
import {
  agGridCellByColId,
  agGridRowByText,
  agGridPinnedBottomRow,
  clickRowAction,
  setGridAccountTreeCellValue,
} from "../support/grid";
import { openDialogFromButton } from "../support/ui";

let seeded: SeededData;

test.beforeAll(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
});

test("liability opening debt survives list and ledger edits, becomes an overpayment, and can be cleared", async ({
  page,
}) => {
  const name = "Signed Opening Credit Card";
  await page.goto(`/${seeded.accountBookId}/accounts?tab=LIABILITY`);
  const dialog = await openDialogFromButton(page, {
    buttonName: "Add Account",
    dialogName: "New Account",
  });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Opening Balance").fill("-100");
  await expect(
    dialog.getByLabel("Opening Balance"),
  ).toHaveAccessibleDescription(
    "Use positive amounts for balances you own and negative amounts for balances you owe.",
  );
  await dialog.getByRole("combobox", { name: "Currency" }).click();
  await page
    .getByRole("option", { name: "CHF – Swiss Franc", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Create" }).click();
  const row = agGridRowByText(page, name);
  await expect(agGridCellByColId(row, "balanceInReferenceCurrency")).toHaveText(
    "-100.00",
  );
  await expect(
    agGridCellByColId(
      agGridPinnedBottomRow(page),
      "balanceInReferenceCurrency",
    ),
  ).toHaveText("-100.00");

  const card = await prisma.account.findFirstOrThrow({
    where: { accountBookId: seeded.accountBookId, name },
  });
  const openingValues = async () =>
    (
      await prisma.booking.findMany({
        where: { accountBookId: seeded.accountBookId, accountId: card.id },
      })
    ).map((booking) => booking.value.toString());
  expect(await openingValues()).toEqual(["-100"]);
  await clickRowAction(row, "Edit");
  const edit = page.getByRole("dialog", { name: "Edit Account" });
  await expect(edit.getByLabel("Opening Balance")).toHaveValue("-100");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  expect(await openingValues()).toEqual(["-100"]);

  await page.goto(`/${seeded.accountBookId}/${card.id}`);
  await expect(
    agGridCellByColId(
      agGridRowByText(page, `Opening balance adjustment: ${name}`),
      "balance",
    ),
  ).toHaveText("-100.00");
  const editAccount = page
    .getByRole("button", { name: "Edit", exact: true })
    .filter({ hasText: "Edit" });
  await editAccount.click();
  await expect(edit.getByLabel("Opening Balance")).toHaveValue("-100");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  expect(await openingValues()).toEqual(["-100"]);

  await editAccount.click();
  await edit.getByLabel("Opening Balance").fill("25");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  expect(await openingValues()).toEqual(["25"]);
  await expect(
    agGridCellByColId(
      agGridRowByText(page, `Opening balance adjustment: ${name}`),
      "balance",
    ),
  ).toHaveText("25.00");

  await editAccount.click();
  await edit.getByLabel("Opening Balance").fill("");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  expect(await openingValues()).toEqual([]);
});

test("liability import keeps configured sign inversion, negative previews, and duplicate matching", async ({
  page,
}) => {
  const card = await prisma.account.create({
    data: {
      accountBookId: seeded.accountBookId,
      name: "Signed Import Credit Card",
      type: "LIABILITY",
      unit: "CURRENCY",
      currency: "CHF",
      statementImportCsvFormat: {
        hasHeader: true,
        delimitersToGuess: [","],
        mappings: {
          date: { header: "Date" },
          amount: {
            mode: "signed",
            column: { header: "Amount" },
            invertSign: true,
          },
          description: { header: "Description" },
        },
      },
    },
  });
  await prisma.transaction.create({
    data: {
      accountBookId: seeded.accountBookId,
      description: "Existing card debt",
      bookings: {
        create: [
          {
            accountId: card.id,
            date: new Date("2026-01-01Z"),
            description: "",
            unit: "CURRENCY",
            currency: "CHF",
            value: -100,
          },
          {
            accountId: seeded.cashAccount.id,
            date: new Date("2026-01-01Z"),
            description: "",
            unit: "CURRENCY",
            currency: "CHF",
            value: 100,
          },
        ],
      },
    },
  });
  const description = "Signed card purchase";
  const upload = async () => {
    await page.goto(`/${seeded.accountBookId}/${card.id}`);
    await page.getByRole("button", { name: "Account actions" }).click();
    await page.getByRole("menuitem", { name: "Import Statement" }).click();
    await expect(page.getByText("Drop CSV File Here")).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({
      name: "card.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        `Date,Amount,Description\n2026-02-02,25,${description}`,
      ),
    });
  };
  await upload();
  const row = agGridRowByText(page, description);
  await expect(agGridCellByColId(row, "amount")).toHaveText("-25.00");
  await expect(agGridCellByColId(row, "balance")).toHaveText("-125.00");
  await expect(
    agGridCellByColId(
      agGridRowByText(page, "Balance carried forward"),
      "balance",
    ),
  ).toHaveText("-100.00");
  await setGridAccountTreeCellValue({
    root: page,
    rowIndex: Number(await row.getAttribute("row-index")),
    colId: "counterAccountId",
    accountName: seeded.expenseAccount.name,
  });
  await expect(agGridCellByColId(row, "status")).toContainText("Ready");
  await page.getByRole("button", { name: "Import Transactions" }).click();
  await expect(
    page.getByRole("heading", { name: card.name, exact: true }),
  ).toBeVisible();
  const bookings = await getTransactionBookingsByDescription({
    accountBookId: seeded.accountBookId,
    description,
  });
  expect(bookings.find((booking) => booking.accountId === card.id)?.value).toBe(
    -25,
  );
  expect(
    bookings.find((booking) => booking.accountId === seeded.expenseAccount.id)
      ?.value,
  ).toBe(25);
  await expect(
    agGridCellByColId(agGridRowByText(page, description), "balance"),
  ).toHaveText("-125.00");
  await upload();
  await expect(agGridCellByColId(row, "status")).toContainText(
    "Already exists",
  );
  await expect(agGridCellByColId(row, "balance")).toHaveText("-125.00");
  await expect(
    page.getByRole("button", { name: "Import Transactions" }),
  ).toBeDisabled();
  expect(
    await prisma.transaction.count({
      where: { accountBookId: seeded.accountBookId, description },
    }),
  ).toBe(1);
});

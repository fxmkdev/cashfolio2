import { expect, test, type Page } from "@playwright/test";
import { agGridRowByText, clickRowAction } from "../support/grid";
import {
  seedDatabase,
  seedNonZeroConvertibleAssetBalances,
  type SeededData,
} from "../support/db";
import { openDialogFromButton } from "../support/ui";

let seeded: SeededData;

test.beforeAll(async () => {
  seeded = await seedDatabase();
});

async function createAssetAccount(args: { page: Page; name: string }) {
  const dialog = await openDialogFromButton(args.page, {
    buttonName: "Add Account",
    dialogName: "New Account",
  });
  await dialog.getByLabel("Name").fill(args.name);
  await dialog.getByRole("combobox", { name: "Currency" }).click();
  await args.page.getByRole("option", { name: "CHF" }).first().click();
  await dialog.getByRole("button", { name: "Create" }).click();
}

async function archiveAccountRow(args: { page: Page; name: string }) {
  const row = agGridRowByText(args.page, args.name);
  await expect(row).toBeVisible();
  await clickRowAction(row, "Archive");
  await expect(
    args.page.getByRole("dialog", { name: "Archive Account" }),
  ).toBeVisible();
  await args.page
    .getByRole("dialog", { name: "Archive Account" })
    .getByRole("button", { name: "Archive" })
    .click();
  await expect(agGridRowByText(args.page, args.name)).toHaveCount(0);
}

test("create, edit, archive, and unarchive account", async ({ page }) => {
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);

  const createdName = "E2E Asset Account";
  const updatedName = "E2E Asset Account Updated";
  await createAssetAccount({ page, name: createdName });

  const createdRow = agGridRowByText(page, createdName);
  await expect(createdRow).toBeVisible();

  await clickRowAction(createdRow, "Edit");
  const editDialog = page.getByRole("dialog", { name: "Edit Account" });
  await expect(editDialog).toBeVisible();
  await editDialog.getByLabel("Name").fill(updatedName);
  await page
    .getByRole("dialog", { name: "Edit Account" })
    .getByRole("button", { name: "Save" })
    .click();

  const updatedRow = agGridRowByText(page, updatedName);
  await expect(updatedRow).toBeVisible();

  await archiveAccountRow({ page, name: updatedName });

  await page.getByRole("link", { name: "Archive" }).click();
  const archivedRow = agGridRowByText(page, updatedName);
  await expect(archivedRow).toBeVisible();

  await archivedRow.dblclick();
  await expect(
    page.getByRole("button", { name: "Add Transaction" }),
  ).toBeVisible();
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=archived`);
  await expect(archivedRow).toBeVisible();

  await clickRowAction(archivedRow, "Unarchive");
  await expect(agGridRowByText(page, updatedName)).toHaveCount(0);

  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);
  const unarchivedRow = agGridRowByText(page, updatedName);
  await expect(unarchivedRow).toBeVisible();
});

test("archived mode allows edit, reorder siblings, and delete", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);

  const primaryName = "E2E Archived Primary";
  const siblingName = "E2E Archived Sibling";
  const renamedPrimaryName = "E2E Archived Primary Updated";

  await createAssetAccount({ page, name: primaryName });
  await createAssetAccount({ page, name: siblingName });

  await archiveAccountRow({ page, name: primaryName });
  await archiveAccountRow({ page, name: siblingName });

  await page.getByRole("link", { name: "Archive" }).click();

  const archivedPrimaryRow = agGridRowByText(page, primaryName);
  await expect(archivedPrimaryRow).toBeVisible();
  await clickRowAction(archivedPrimaryRow, "Edit");
  await expect(
    page.getByRole("dialog", { name: "Edit Account" }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "Edit Account" })
    .getByLabel("Name")
    .fill(renamedPrimaryName);
  await page
    .getByRole("dialog", { name: "Edit Account" })
    .getByRole("button", { name: "Save" })
    .click();

  const renamedArchivedPrimaryRow = agGridRowByText(page, renamedPrimaryName);
  await expect(renamedArchivedPrimaryRow).toBeVisible();
  await clickRowAction(renamedArchivedPrimaryRow, "Reorder Siblings");
  await expect(
    page.getByRole("dialog", { name: "Reorder Siblings" }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "Reorder Siblings" })
    .getByRole("button", { name: "Close" })
    .click();

  const archivedSiblingRow = agGridRowByText(page, siblingName);
  await expect(archivedSiblingRow).toBeVisible();
  await clickRowAction(archivedSiblingRow, "Delete");
  await expect(
    page.getByRole("dialog", { name: "Delete Account" }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "Delete Account" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(agGridRowByText(page, siblingName)).toHaveCount(0);

  await clickRowAction(renamedArchivedPrimaryRow, "Unarchive");
  await expect(agGridRowByText(page, renamedPrimaryName)).toHaveCount(0);

  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);
  const unarchivedRow = agGridRowByText(page, renamedPrimaryName);
  await expect(unarchivedRow).toBeVisible();
});

test("navigate from accounts grid to ledger", async ({ page }) => {
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);

  const cashRow = agGridRowByText(page, seeded.cashAccount.name);
  await expect(cashRow).toBeVisible();
  await cashRow.dblclick();

  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/${seeded.cashAccount.id}`),
  );
  await expect(
    page.getByRole("button", { name: "Add Transaction" }),
  ).toBeVisible();
});

test("archive action is disabled for non-zero asset balances", async ({
  page,
}) => {
  const seededBalances = await seedNonZeroConvertibleAssetBalances({
    accountBookId: seeded.accountBookId,
    counterAccountId: seeded.cashAccount.id,
  });

  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);

  const usdRow = agGridRowByText(page, seededBalances.usdAccountName);
  await expect(usdRow).toBeVisible();
  await usdRow.hover();

  const archiveButton = usdRow.getByRole("button", { name: "Archive" });
  await expect(archiveButton).toBeDisabled();
});

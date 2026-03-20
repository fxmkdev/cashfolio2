import { expect, test } from "@playwright/test";
import { agGridRowByText, clickRowAction } from "../support/grid";
import {
  closeDatabase,
  resetAndSeedDatabase,
  type SeededData,
} from "../support/db";

let seeded: SeededData;

test.beforeAll(async () => {
  seeded = await resetAndSeedDatabase();
});

test.afterAll(async () => {
  await closeDatabase();
});

test("create, edit, archive, and unarchive account", async ({ page }) => {
  await page.goto(`/${seeded.accountBookId}/?tab=ASSET&mode=active`);

  const createdName = "E2E Asset Account";
  const updatedName = "E2E Asset Account Updated";

  await page.getByTestId("accounts-add-account").click();
  await page.getByLabel("Name").fill(createdName);
  await page.getByRole("textbox", { name: "Currency" }).click();
  await page.getByRole("option", { name: "CHF" }).first().click();
  await page.getByTestId("account-modal-submit").click();

  const createdRow = agGridRowByText(page, createdName);
  await expect(createdRow).toBeVisible();

  await clickRowAction(createdRow, "Edit");
  await page.getByLabel("Name").fill(updatedName);
  await page.getByTestId("account-modal-submit").click();

  const updatedRow = agGridRowByText(page, updatedName);
  await expect(updatedRow).toBeVisible();

  await clickRowAction(updatedRow, "Archive");
  await page.getByTestId("confirm-archive-button").click();
  await expect(agGridRowByText(page, updatedName)).toHaveCount(0);

  await page.getByTestId("accounts-open-archive").click();
  const archivedRow = agGridRowByText(page, updatedName);
  await expect(archivedRow).toBeVisible();

  await clickRowAction(archivedRow, "Unarchive");
  await expect(agGridRowByText(page, updatedName)).toHaveCount(0);

  await page.goto(`/${seeded.accountBookId}/?tab=ASSET&mode=active`);
  const unarchivedRow = agGridRowByText(page, updatedName);
  await expect(unarchivedRow).toBeVisible();
});

test("navigate from accounts grid to ledger", async ({ page }) => {
  await page.goto(`/${seeded.accountBookId}/?tab=ASSET&mode=active`);

  const cashRow = agGridRowByText(page, seeded.cashAccount.name);
  await expect(cashRow).toBeVisible();
  await cashRow.dblclick();

  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/${seeded.cashAccount.id}`),
  );
  await expect(page.getByTestId("ledger-add-transaction")).toBeVisible();
});

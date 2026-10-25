import { createId } from "@paralleldrive/cuid2";
import { AssetClass, AccountType, Unit } from "../../src/.prisma-client/enums";
import { prisma } from "../support/db-client";
import { seedDatabase } from "../support/db";
import {
  clickGridRowSelectionCheckbox,
  expandArchivedGroups,
  revealRowActions,
} from "../support/grid";
import { expect, test, type Page } from "../support/fixtures";

async function applyClass(page: Page, label: string) {
  const dialog = page.getByRole("dialog", {
    name: "Set Asset Class",
    exact: true,
  });
  await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
  await dialog.getByLabel("Asset Class").click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).not.toBeVisible();
}

test("assigns selected active and archived accounts, replaces existing classes, and clears to Unclassified", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({ userExternalId: e2eExternalId });
  const ids = [createId(), createId()];
  await prisma.account.createMany({
    data: ids.map((id, index) => ({
      id,
      accountBookId: book.accountBookId,
      name: `Bulk Selection ${index}`,
      type: AccountType.BALANCE,
      unit: Unit.CURRENCY,
      currency: "CHF",
      isActive: index === 0,
      assetClass: AssetClass.FIXED_INCOME,
    })),
  });
  await page.goto(`/${book.accountBookId}/accounts`);
  await expandArchivedGroups(page);
  for (const id of ids)
    await clickGridRowSelectionCheckbox(
      page.locator(`.ag-row[row-id="${id}"]`).first(),
    );
  await expect(
    page.getByRole("toolbar", { name: "Selected Account Actions" }),
  ).toContainText("2 accounts selected");
  await page
    .getByRole("button", { name: "Set Asset Class", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Set Asset Class",
    exact: true,
  });
  await expect(dialog).toContainText("2 accounts (1 archived)");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("toolbar", { name: "Selected Account Actions" }),
  ).toContainText("2 accounts selected");
  await page
    .getByRole("button", { name: "Set Asset Class", exact: true })
    .click();
  await applyClass(page, "Equities");
  await expect(
    page.getByRole("toolbar", { name: "Selected Account Actions" }),
  ).toHaveCount(0);
  await expect
    .poll(async () =>
      (await prisma.account.findMany({ where: { id: { in: ids } } })).map(
        (account) => account.assetClass,
      ),
    )
    .toEqual([AssetClass.EQUITIES, AssetClass.EQUITIES]);
  for (const id of ids) {
    const row = page.locator(`.ag-row[row-id="${id}"]`).first();
    await expect(row.locator('[col-id="assetClass"]')).toHaveText("Equities");
    await clickGridRowSelectionCheckbox(row);
  }
  await page
    .getByRole("button", { name: "Set Asset Class", exact: true })
    .click();
  await applyClass(page, "Unclassified");
  await expect
    .poll(async () =>
      (await prisma.account.findMany({ where: { id: { in: ids } } })).map(
        (account) => account.assetClass,
      ),
    )
    .toEqual([null, null]);
  expect(
    (
      await prisma.account.findUniqueOrThrow({
        where: {
          id_accountBookId: {
            id: book.cashAccount.id,
            accountBookId: book.accountBookId,
          },
        },
      })
    ).assetClass,
  ).toBeNull();
});

test("group assignment includes collapsed subgroups and archived descendants only in that group", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({ userExternalId: e2eExternalId });
  const common = {
    accountBookId: book.accountBookId,
    type: AccountType.BALANCE,
  };
  const group = await prisma.accountGroup.create({
    data: { ...common, id: createId(), name: "Bulk Portfolio" },
  });
  const nested = await prisma.accountGroup.create({
    data: {
      ...common,
      id: createId(),
      name: "Closed Portfolio",
      parentGroupId: group.id,
      isActive: false,
    },
  });
  const ids = [createId(), createId(), createId()];
  await prisma.account.createMany({
    data: ids.map((id, index) => ({
      ...common,
      id,
      name: `Portfolio Holding ${index}`,
      unit: Unit.CURRENCY,
      currency: "CHF",
      groupId: index === 2 ? nested.id : group.id,
      isActive: index === 0,
      assetClass: AssetClass.DIGITAL_ASSETS,
    })),
  });
  await page.goto(`/${book.accountBookId}/accounts`);
  const row = page.locator(`.ag-row[row-id="${group.id}"]`).first();
  await expect(row).toBeVisible();
  // The group shortcut deliberately includes descendants that are not expanded.
  const stableRow = await revealRowActions(row);
  await stableRow
    .getByRole("button", { name: "Set Asset Class for Accounts…" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Set Asset Class", exact: true }),
  ).toContainText("3 accounts (2 archived)");
  await applyClass(page, "Equities");
  await expect
    .poll(async () =>
      (await prisma.account.findMany({ where: { id: { in: ids } } })).map(
        (account) => account.assetClass,
      ),
    )
    .toEqual([AssetClass.EQUITIES, AssetClass.EQUITIES, AssetClass.EQUITIES]);
  expect(
    (
      await prisma.account.findUniqueOrThrow({
        where: {
          id_accountBookId: {
            id: book.cashAccount.id,
            accountBookId: book.accountBookId,
          },
        },
      })
    ).assetClass,
  ).toBeNull();
});

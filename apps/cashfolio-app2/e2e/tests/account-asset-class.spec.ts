import { seedDatabase, type SeededData } from "../support/db";
import { prisma } from "../support/db-client";
import { expect, test } from "../support/fixtures";
import { agGridRowByText, clickRowAction } from "../support/grid";
import { openDialogFromButton } from "../support/ui";

let seeded: SeededData;
test.beforeAll(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
});

test("manually classifies a currency portfolio from Accounts and clears it from its booked ledger", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET`);
  const dialog = await openDialogFromButton(page, {
    buttonName: "Add Account",
    dialogName: "New Account",
  });
  const name = "Manually classified portfolio";
  await dialog.getByLabel("Name").fill(name);
  const assetClass = dialog.getByRole("combobox", { name: "Asset Class" });
  await expect(assetClass).toHaveValue("");
  await expect(assetClass).toHaveAttribute("placeholder", "Unclassified");
  const unit = dialog.getByRole("combobox", { name: "Unit", exact: true });
  await unit.click();
  await page.getByRole("option", { name: "Security", exact: true }).click();
  await expect(assetClass).toHaveValue("");
  await assetClass.click();
  await page.getByRole("option", { name: "Equities", exact: true }).click();
  await unit.click();
  await page.getByRole("option", { name: "Currency", exact: true }).click();
  await expect(assetClass).toHaveValue("Equities");
  await dialog.getByRole("combobox", { name: "Currency", exact: true }).click();
  await page.getByRole("option", { name: "CHF" }).first().click();
  await dialog.getByLabel("Opening Balance").fill("50");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  const row = agGridRowByText(page, name);
  await expect(row).toBeVisible();
  const nextCreate = await openDialogFromButton(page, {
    buttonName: "Add Account",
    dialogName: "New Account",
  });
  await expect(
    nextCreate.getByRole("combobox", { name: "Asset Class" }),
  ).toHaveValue("");
  await nextCreate.getByRole("button", { name: "Cancel", exact: true }).click();
  const account = await prisma.account.findFirstOrThrow({
    where: { accountBookId: seeded.accountBookId, name },
  });
  expect(account.assetClass).toBe("EQUITIES");
  const bookings = await prisma.booking.findMany({
    where: { accountBookId: seeded.accountBookId, accountId: account.id },
    orderBy: { id: "asc" },
  });
  expect(bookings).toHaveLength(1);

  await clickRowAction(row, "Edit");
  const edit = page.getByRole("dialog", { name: "Edit Account" });
  await expect(
    edit.getByRole("combobox", { name: "Unit", exact: true }),
  ).toBeDisabled();
  await expect(edit.getByRole("combobox", { name: "Asset Class" })).toHaveValue(
    "Equities",
  );
  await edit.getByRole("combobox", { name: "Asset Class" }).click();
  await page.getByRole("option", { name: "Other Assets", exact: true }).click();
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await expect(edit).not.toBeVisible();

  await page.goto(`/${seeded.accountBookId}/${account.id}`);
  await page
    .getByRole("button", { name: "Edit", exact: true, disabled: false })
    .click();
  await expect(edit.getByRole("combobox", { name: "Asset Class" })).toHaveValue(
    "Other Assets",
  );
  await edit.getByRole("combobox", { name: "Asset Class" }).click();
  await page.getByRole("option", { name: "Unclassified", exact: true }).click();
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await expect(edit).not.toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Edit", exact: true, disabled: false })
    .click();
  await expect(edit.getByRole("combobox", { name: "Asset Class" })).toHaveValue(
    "",
  );
  const reloaded = await prisma.account.findUniqueOrThrow({
    where: {
      id_accountBookId: { id: account.id, accountBookId: seeded.accountBookId },
    },
  });
  expect(reloaded).toMatchObject({
    assetClass: null,
    unit: account.unit,
    currency: account.currency,
    isCashAccount: account.isCashAccount,
  });
  expect(
    await prisma.booking.findMany({
      where: { accountBookId: seeded.accountBookId, accountId: account.id },
      orderBy: { id: "asc" },
    }),
  ).toEqual(bookings);
});

import { seedDatabase } from "../support/db";
import { prisma } from "../support/db-client";
import { expect, test } from "../support/fixtures";
import { agGridRowByText, clickRowAction } from "../support/grid";
import { openDialogFromButton } from "../support/ui";

test("supports balance groups, canonicalizes legacy URLs, and persists the unified type", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({ userExternalId: e2eExternalId });
  const legacyGroup = await prisma.accountGroup.create({
    data: {
      accountBookId: book.accountBookId,
      name: "Legacy Credit",
      type: "BALANCE",
    },
  });
  const card = await prisma.account.create({
    data: {
      accountBookId: book.accountBookId,
      name: "Legacy Card",
      type: "BALANCE",
      groupId: legacyGroup.id,
      unit: "CURRENCY",
      currency: "CHF",
    },
  });

  for (const tab of ["ASSET", "LIABILITY"]) {
    await page.goto(`/${book.accountBookId}/accounts?tab=${tab}&mode=archived`);
    await expect(page).toHaveURL(/\/accounts\?tab=BALANCE&mode=active$/);
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(agGridRowByText(page, book.cashAccount.name)).toBeVisible();
    await expect(agGridRowByText(page, card.name)).toBeVisible();
  }

  const group = await openDialogFromButton(page, {
    buttonName: "Add Group",
    dialogName: "New Group",
  });
  await expect(
    group.getByRole("combobox", { name: "Type", exact: true }),
  ).toHaveCount(0);
  await group.getByLabel("Name").fill("Everyday");
  await group
    .getByRole("checkbox", { name: "Include in Cash Flow", exact: true })
    .check();
  await group.getByRole("button", { name: "Create", exact: true }).click();
  await expect(group).toBeHidden();

  await clickRowAction(agGridRowByText(page, "Legacy Credit"), "Edit");
  const editGroup = page.getByRole("dialog", {
    name: "Edit Group",
    exact: true,
  });
  await editGroup.getByLabel("Parent Group").fill("Everyday");
  await page
    .getByRole("option", { name: /^(?:(?:Collapse|Expand) )?Everyday$/ })
    .click();
  await editGroup.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editGroup).toBeHidden();
  const everyday = await prisma.accountGroup.findFirstOrThrow({
    where: { accountBookId: book.accountBookId, name: "Everyday" },
  });
  expect(everyday.type).toBe("BALANCE");
  expect(
    await prisma.accountGroup.findUniqueOrThrow({
      where: {
        id_accountBookId: {
          id: legacyGroup.id,
          accountBookId: book.accountBookId,
        },
      },
    }),
  ).toMatchObject({
    type: "BALANCE",
    parentGroupId: everyday.id,
    isCashAccount: true,
  });
  expect(
    await prisma.account.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: card.id, accountBookId: book.accountBookId },
      },
    }),
  ).toMatchObject({ type: "BALANCE", isCashAccount: true });

  const create = await openDialogFromButton(page, {
    buttonName: "Add Account",
    dialogName: "New Account",
  });
  await expect(
    create.getByRole("combobox", { name: "Type", exact: true }),
  ).toHaveCount(0);
  await create.getByLabel("Name").fill("New Overdraft");
  await create.getByLabel("Opening Balance").fill("-50");
  await create.getByRole("combobox", { name: "Currency", exact: true }).click();
  await page
    .getByRole("option", { name: "CHF – Swiss Franc", exact: true })
    .click();
  await create.getByLabel("Group", { exact: true }).fill("Everyday");
  await page
    .getByRole("option", { name: /^(?:(?:Collapse|Expand) )?Everyday$/ })
    .click();
  await create.getByRole("button", { name: "Create", exact: true }).click();
  await expect(create).toBeHidden();
  expect(
    await prisma.account.findFirstOrThrow({
      where: { accountBookId: book.accountBookId, name: "New Overdraft" },
    }),
  ).toMatchObject({
    type: "BALANCE",
    groupId: everyday.id,
    isCashAccount: true,
  });

  await page.goto(`/${book.accountBookId}/${card.id}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit Account", exact: true });
  await expect(
    edit.getByRole("combobox", { name: "Type", exact: true }),
  ).toHaveCount(0);
  await edit.getByLabel("Group", { exact: true }).fill("Everyday");
  await page
    .getByRole("option", { name: /^(?:(?:Collapse|Expand) )?Everyday$/ })
    .click();
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await expect(edit).toBeHidden();
  expect(
    await prisma.account.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: card.id, accountBookId: book.accountBookId },
      },
    }),
  ).toMatchObject({ type: "BALANCE", groupId: everyday.id });
});

import { createId } from "@paralleldrive/cuid2";
import { AccountType, AssetClass, Unit } from "../../src/.prisma-client/enums";
import { prisma } from "../support/db-client";
import { seedDatabase } from "../support/db";
import {
  clickGridRowSelectionCheckbox,
  expandArchivedGroups,
} from "../support/grid";
import { expect, test, type Page } from "../support/fixtures";

async function selectAccounts(
  page: Page,
  accountBookId: string,
  ids: string[],
  archived = false,
) {
  await page.goto(`/${accountBookId}/accounts`);
  if (archived) {
    await expect(
      page.locator('[row-id^="__archived__:"]').first(),
    ).toBeVisible();
    await expandArchivedGroups(page);
  }
  for (const id of ids)
    await clickGridRowSelectionCheckbox(
      page.locator(`.ag-row[row-id="${id}"]`).first(),
    );
  await page
    .getByRole("button", { name: "Move to Group", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Move to Group", exact: true });
}

async function chooseGroup(page: Page, name: string) {
  const dialog = page.getByRole("dialog", {
    name: "Move to Group",
    exact: true,
  });
  await dialog.getByLabel("Destination Group").click();
  await page.getByRole("option", { name, exact: true }).click();
  return dialog;
}

const currencyAccount = {
  type: AccountType.BALANCE,
  unit: Unit.CURRENCY,
  currency: "CHF",
  assetClass: AssetClass.FIXED_INCOME,
  sortOrder: 3,
};

test("bulk move discloses inherited cash-flow changes and preserves other account fields", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({ userExternalId: e2eExternalId });
  const untouchedQuery = {
    where: {
      id_accountBookId: {
        id: book.cashAccount.id,
        accountBookId: book.accountBookId,
      },
    },
    select: { groupId: true, isCashAccount: true, assetClass: true },
  };
  const untouchedBefore =
    await prisma.account.findUniqueOrThrow(untouchedQuery);
  const target = await prisma.accountGroup.create({
    data: {
      id: createId(),
      name: "Bulk Move Target",
      accountBookId: book.accountBookId,
      type: AccountType.BALANCE,
    },
  });
  const ids = [createId(), createId()];
  await prisma.account.createMany({
    data: ids.map((id, index) => ({
      ...currencyAccount,
      id,
      name: `Move Account ${index}`,
      accountBookId: book.accountBookId,
      isActive: index === 0,
      isCashAccount: index === 0,
    })),
  });
  let dialog = await selectAccounts(page, book.accountBookId, ids, true);
  await expect(
    dialog.getByRole("button", { name: "Move", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("toolbar", { name: "Selected Account Actions" }),
  ).toContainText("2 accounts selected");
  await page
    .getByRole("button", { name: "Move to Group", exact: true })
    .click();
  dialog = await chooseGroup(page, target.name);
  await expect(dialog).toContainText("2 accounts selected (1 archived)");
  await expect(dialog).toContainText(
    "1 will be excluded from cash flow: Move Account 0",
  );
  await expect(dialog).toContainText("all historical periods");
  await dialog.getByRole("button", { name: "Move", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("toolbar", { name: "Selected Account Actions" }),
  ).toHaveCount(0);
  for (const [index, id] of ids.entries()) {
    const account = await prisma.account.findUniqueOrThrow({
      where: { id_accountBookId: { id, accountBookId: book.accountBookId } },
    });
    expect(account).toMatchObject({
      ...currencyAccount,
      name: `Move Account ${index}`,
      groupId: target.id,
      isActive: index === 0,
      isCashAccount: false,
    });
  }
  expect(await prisma.account.findUniqueOrThrow(untouchedQuery)).toEqual(
    untouchedBefore,
  );
});

test("moving to No Group preserves mixed inherited cash-flow inclusion", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({ userExternalId: e2eExternalId });
  const ids: string[] = [];
  for (const isCashAccount of [false, true]) {
    const group = await prisma.accountGroup.create({
      data: {
        id: createId(),
        name: `Source ${isCashAccount}`,
        accountBookId: book.accountBookId,
        type: AccountType.BALANCE,
        isCashAccount,
      },
    });
    const account = await prisma.account.create({
      data: {
        ...currencyAccount,
        id: createId(),
        name: `Root Move ${isCashAccount}`,
        accountBookId: book.accountBookId,
        groupId: group.id,
        isCashAccount,
      },
    });
    ids.push(account.id);
  }
  await selectAccounts(page, book.accountBookId, ids);
  const dialog = await chooseGroup(page, "No Group");
  await expect(dialog).toContainText(
    "preserves each account’s current cash-flow inclusion",
  );
  await dialog.getByRole("button", { name: "Move", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  for (const [index, id] of ids.entries())
    expect(
      await prisma.account.findUniqueOrThrow({
        where: { id_accountBookId: { id, accountBookId: book.accountBookId } },
      }),
    ).toMatchObject({ groupId: null, isCashAccount: index === 1 });
});

test("a stale destination name conflict rejects the entire move and retains the draft for retry", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({ userExternalId: e2eExternalId });
  const target = await prisma.accountGroup.create({
    data: {
      id: createId(),
      name: "Conflict Target",
      accountBookId: book.accountBookId,
      type: AccountType.BALANCE,
    },
  });
  const ids = [createId(), createId()];
  await prisma.account.createMany({
    data: ids.map((id, index) => ({
      ...currencyAccount,
      id,
      name: `Conflict Move ${index}`,
      accountBookId: book.accountBookId,
    })),
  });
  await selectAccounts(page, book.accountBookId, ids);
  const dialog = await chooseGroup(page, target.name);
  await expect(
    dialog.getByRole("button", { name: "Move", exact: true }),
  ).toBeEnabled();
  const conflict = await prisma.account.create({
    data: {
      ...currencyAccount,
      id: createId(),
      name: "CONFLICT MOVE 0",
      accountBookId: book.accountBookId,
      groupId: target.id,
    },
  });
  await dialog.getByRole("button", { name: "Move", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("same name");
  await expect(dialog.getByLabel("Destination Group")).toHaveValue(target.name);
  expect(
    await prisma.account.count({ where: { id: { in: ids }, groupId: null } }),
  ).toBe(2);
  await prisma.account.delete({
    where: {
      id_accountBookId: { id: conflict.id, accountBookId: book.accountBookId },
    },
  });
  await dialog.getByRole("button", { name: "Refresh Choices" }).click();
  await expect(
    dialog.getByRole("button", { name: "Move", exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Move", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    await prisma.account.count({
      where: { id: { in: ids }, groupId: target.id },
    }),
  ).toBe(2);
});

import { createId } from "@paralleldrive/cuid2";
import { AccountType, Unit } from "../../src/.prisma-client/enums";
import { prisma } from "../support/db-client";
import { seedDatabase } from "../support/db";
import { clickGridRowSelectionCheckbox } from "../support/grid";
import { expect, test } from "../support/fixtures";

test("organizes an account and complete group subtree, persists ordering, and undoes the latest move", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({ userExternalId: e2eExternalId });
  const [source, nested, destination, child, archived, free] = Array.from(
    { length: 6 },
    () => createId(),
  );
  const common = {
    accountBookId: book.accountBookId,
    type: AccountType.BALANCE,
  };
  await prisma.accountGroup.createMany({
    data: [
      { ...common, id: source, name: "Organize Source", sortOrder: 0 },
      {
        ...common,
        id: nested,
        name: "Organize Nested",
        parentGroupId: source,
        sortOrder: 0,
      },
      {
        ...common,
        id: destination,
        name: "Organize Destination",
        sortOrder: 1,
      },
    ],
  });
  await prisma.account.createMany({
    data: [
      {
        ...common,
        id: child,
        name: "Organize Child",
        groupId: nested,
        unit: Unit.CURRENCY,
        currency: "CHF",
      },
      {
        ...common,
        id: archived,
        name: "Organize Archived",
        groupId: source,
        unit: Unit.CURRENCY,
        currency: "CHF",
        isActive: false,
      },
      {
        ...common,
        id: free,
        name: "Organize Free",
        unit: Unit.CURRENCY,
        currency: "CHF",
        sortOrder: 2,
      },
    ],
  });
  await page.goto(`/${book.accountBookId}/accounts`);
  await page.getByRole("button", { name: "Organize", exact: true }).click();
  const organizer = page.getByRole("region", { name: "Organize Accounts" });
  await expect(organizer.locator(`.ag-row[row-id="${source}"]`)).toBeVisible();
  await expect(
    organizer.locator(`.ag-row[row-id="${archived}"]`),
  ).toBeVisible();
  await organizer.getByRole("checkbox", { name: "Show Archived" }).uncheck();
  await expect(organizer.locator(`.ag-row[row-id="${archived}"]`)).toHaveCount(
    0,
  );
  for (const id of [source, free])
    await clickGridRowSelectionCheckbox(
      organizer.locator(`.ag-row[row-id="${id}"]`),
    );
  await organizer
    .getByRole("toolbar")
    .getByRole("button", { name: "Move To…", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Move To…" });
  await expect(dialog).toContainText("3 included descendants");
  await dialog.getByLabel("Destination").click();
  await page
    .getByRole("option", { name: "Organize Destination", exact: true })
    .click();
  let releaseSave!: () => void;
  let saving!: () => void;
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  const saveStarted = new Promise<void>((resolve) => {
    saving = resolve;
  });
  let held = false;
  await page.route("**/_serverFn/**", async (route) => {
    if (!held && route.request().method() === "POST") {
      held = true;
      saving();
      await saveGate;
    }
    await route.continue();
  });
  try {
    await dialog.getByRole("button", { name: "Move", exact: true }).click();
    await saveStarted;
    await expect(
      page.getByRole("button", { name: "Done", exact: true }),
    ).toBeDisabled();
    await page.evaluate(() => window.history.back());
    await expect(page).not.toHaveURL(/organize=true/);
    await expect(organizer).toBeVisible();
  } finally {
    releaseSave();
  }
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Organize", exact: true }),
  ).toBeVisible();
  await page.unroute("**/_serverFn/**");
  await expect
    .poll(
      async () =>
        (
          await prisma.accountGroup.findUniqueOrThrow({
            where: {
              id_accountBookId: {
                id: source,
                accountBookId: book.accountBookId,
              },
            },
          })
        ).parentGroupId,
    )
    .toBe(destination);
  const accountState = async () =>
    prisma.account.findMany({
      where: {
        id: { in: [child, archived, free] },
        accountBookId: book.accountBookId,
      },
      orderBy: { id: "asc" },
      select: { id: true, groupId: true, isActive: true, sortOrder: true },
    });
  const persisted = await accountState();
  expect(persisted.find((row) => row.id === child)?.groupId).toBe(nested);
  expect(persisted.find((row) => row.id === archived)).toMatchObject({
    groupId: source,
    isActive: false,
  });
  expect(persisted.find((row) => row.id === free)).toMatchObject({
    groupId: destination,
    sortOrder: 1,
  });
  await page.goForward();
  await expect(organizer).toBeVisible();
  await expect(page).toHaveURL(/organize=true/);
  // Forward opens a fresh session; it neither replays nor reverses the saved move.
  expect(await accountState()).toEqual(persisted);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(organizer).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toHaveCount(0);
  await expect(
    organizer.getByRole("checkbox", { name: "Show Archived" }),
  ).toBeChecked();
  await expect(organizer.locator(`.ag-row[row-id="${source}"]`)).toBeVisible();
  expect(await accountState()).toEqual(persisted);
  await organizer
    .getByRole("button", { name: "Move Organize Source", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Move", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await prisma.accountGroup.findUniqueOrThrow({
            where: {
              id_accountBookId: {
                id: source,
                accountBookId: book.accountBookId,
              },
            },
          })
        ).parentGroupId,
    )
    .toBeNull();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await prisma.accountGroup.findUniqueOrThrow({
            where: {
              id_accountBookId: {
                id: source,
                accountBookId: book.accountBookId,
              },
            },
          })
        ).parentGroupId,
    )
    .toBe(destination);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add Account", exact: true }),
  ).toBeVisible();
});

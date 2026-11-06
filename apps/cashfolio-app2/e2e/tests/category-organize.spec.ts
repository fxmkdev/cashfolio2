import { createId } from "@paralleldrive/cuid2";
import { expect, test } from "../support/fixtures";
import { seedDatabase } from "../support/db";
import { prisma } from "../support/db-client";

test("organizes the selected category type with archived descendants and switches hierarchy on tab change", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({ userExternalId: e2eExternalId });
  // The shared reporting seed recreates a legacy mixed-subtype Equity parent.
  // Use a valid subtype-specific category hierarchy, as current migrations do.
  await prisma.accountGroup.update({
    where: {
      id_accountBookId: {
        id: book.expenseGroupId,
        accountBookId: book.accountBookId,
      },
    },
    data: { parentGroupId: null },
  });
  const [source, destination, leaf, archived, income] = Array.from(
    { length: 5 },
    () => createId(),
  );
  const common = {
    accountBookId: book.accountBookId,
    type: "EQUITY" as const,
    equityAccountSubtype: "EXPENSE" as const,
  };
  await prisma.accountGroup.createMany({
    data: [
      { ...common, id: source, name: "Organize Expenses", sortOrder: 0 },
      { ...common, id: destination, name: "Expense Destination", sortOrder: 1 },
      {
        ...common,
        equityAccountSubtype: "INCOME",
        id: income,
        name: "Income Destination",
      },
    ],
  });
  await prisma.account.createMany({
    data: [
      {
        ...common,
        id: leaf,
        name: "Organize Utility",
        groupId: source,
        sortOrder: 0,
      },
      {
        ...common,
        id: archived,
        name: "Archived Utility",
        groupId: source,
        sortOrder: 1,
        isActive: false,
      },
    ],
  });
  const normal = `/${book.accountBookId}/settings/categories?tab=EQUITY-EXPENSE&showArchived=false`;
  await page.goto(`${normal}&organize=true`);
  await expect(page).not.toHaveURL(/organize=/);
  await expect(
    page.getByRole("button", { name: "Organize", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toHaveCount(0);
  const organizer = page.getByRole("region", { name: "Categories Hierarchy" });
  await expect(
    page.getByRole("checkbox", { name: "Show Archived" }),
  ).not.toBeChecked();
  await organizer
    .getByRole("button", { name: "Move Organize Expenses", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Move To…" });
  await expect(dialog).toContainText("2 included descendants (1 archived)");
  await dialog.getByLabel("Destination", { exact: true }).click();
  await expect(
    page.getByRole("option", { name: "Income Destination", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("option", { name: "Expense Destination", exact: true })
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
    .toBe(destination);
  expect(
    await prisma.account.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: archived, accountBookId: book.accountBookId },
      },
    }),
  ).toMatchObject({ groupId: source, isActive: false, isCashAccount: false });
  await page.reload();
  await expect(organizer).toBeVisible();
  await expect(
    organizer.getByRole("checkbox", { name: "Show Archived" }),
  ).not.toBeChecked();
  await page.getByRole("tab", { name: "Income", exact: true }).click();
  await expect(organizer).toBeVisible();
  await expect(page).not.toHaveURL(/organize=true/);
  await expect(
    page.getByRole("button", { name: "Add Income Category", exact: true }),
  ).toBeVisible();
});

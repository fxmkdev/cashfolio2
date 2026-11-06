import { createId } from "@paralleldrive/cuid2";
import { expect, test } from "../support/fixtures";
import { seedDatabase } from "../support/db";
import { prisma } from "../support/db-client";
import { withBookLock } from "../support/book-lock";
import { selectSegmentedControlOption } from "../support/segmented-control";
import { ACCOUNT_BOOK_BUSY_MESSAGE } from "../../src/shared/mutation-errors";

test("a rejected organizer move restores saved order and can be explicitly retried", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({ userExternalId: e2eExternalId });
  const groupId = createId();
  await prisma.accountGroup.create({
    data: {
      id: groupId,
      accountBookId: book.accountBookId,
      name: "Move recovery group",
      type: "BALANCE",
    },
  });
  const ids = [createId(), createId()];
  await prisma.account.createMany({
    data: ids.map((id, sortOrder) => ({
      id,
      name: `Move ${sortOrder}`,
      sortOrder,
      groupId,
      accountBookId: book.accountBookId,
      type: "BALANCE",
      unit: "CURRENCY",
      currency: "CHF",
    })),
  });
  const savedIds = async () =>
    (
      await prisma.account.findMany({
        where: { groupId },
        orderBy: { sortOrder: "asc" },
      })
    ).map((row) => row.id);
  await page.goto(`/${book.accountBookId}/accounts?organize=true`);
  const organizer = page.getByRole("region", { name: "Organize Accounts" });
  await organizer
    .getByRole("button", { name: "Move Move 1", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Move To…" });
  await dialog
    .getByLabel("Destination", { exact: true })
    .fill("Move recovery group");
  await page
    .getByRole("option", { name: "Move recovery group", exact: true })
    .click();
  await selectSegmentedControlOption(
    dialog.getByRole("radiogroup", { name: "Position", exact: true }),
    "First",
  );
  await withBookLock(book.accountBookId, async () => {
    await dialog.getByRole("button", { name: "Move", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      ACCOUNT_BOOK_BUSY_MESSAGE,
      { timeout: 35_000 },
    );
    expect(await savedIds()).toEqual(ids);
    await expect(
      dialog.getByRole("button", { name: "Try Again", exact: true }),
    ).toBeEnabled();
  });
  await dialog.getByRole("button", { name: "Try Again", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(savedIds).toEqual([...ids].reverse());
});

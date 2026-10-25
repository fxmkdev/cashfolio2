import { createId } from "@paralleldrive/cuid2";
import { expect, test } from "../support/fixtures";
import { seedDatabase, type SeededData } from "../support/db";
import { prisma } from "../support/db-client";
import { withBookLock } from "../support/book-lock";
import { ACCOUNT_BOOK_BUSY_MESSAGE } from "../../src/shared/mutation-errors";
import { agGridRowByText, clickRowAction } from "../support/grid";

let seeded: SeededData;

test.beforeEach(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
});

test("a rejected reorder restores the saved grid order and can be explicitly retried", async ({
  page,
}) => {
  const groupId = createId();
  await prisma.accountGroup.create({
    data: {
      id: groupId,
      accountBookId: seeded.accountBookId,
      name: "Reorder recovery group",
      type: "BALANCE",
    },
  });
  const ids = [createId(), createId()];
  const names = ["Reorder first", "Reorder second"];
  await prisma.account.createMany({
    data: ids.map((id, sortOrder) => ({
      id,
      name: names[sortOrder],
      sortOrder,
      groupId,
      accountBookId: seeded.accountBookId,
      type: "BALANCE" as const,
      unit: "CURRENCY" as const,
      currency: "CHF",
    })),
  });
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET`);
  const groupRow = agGridRowByText(page, "Reorder recovery group");
  const contracted = groupRow.locator(".ag-group-contracted").first();
  if (await contracted.isVisible()) await contracted.click();
  await clickRowAction(agGridRowByText(page, names[0]), "Reorder Siblings");
  const dialog = page.getByRole("dialog", { name: "Reorder Siblings" });
  await withBookLock(seeded.accountBookId, async () => {
    const handle = dialog.locator(`.ag-row[row-id="${ids[0]}"] .ag-row-drag`);
    const source = await handle.boundingBox();
    const target = await dialog
      .locator(`.ag-row[row-id="${ids[1]}"]`)
      .boundingBox();
    if (!source || !target) throw new Error("Reorder rows were not visible");
    await page.mouse.move(
      source.x + source.width / 2,
      source.y + source.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      source.x + source.width / 2,
      target.y + target.height - 3,
      { steps: 12 },
    );
    await page.mouse.up();
    await expect(dialog.getByRole("status")).toHaveText(
      "Waiting for another change to finish…",
    );
    await expect(dialog.getByRole("alert")).toHaveText(
      ACCOUNT_BOOK_BUSY_MESSAGE,
      { timeout: 35_000 },
    );
    await expect(
      dialog.locator('.ag-row[row-index="0"] [col-id="name"]'),
    ).toHaveText(names[0]);
    await expect(
      dialog.locator('.ag-row[row-index="1"] [col-id="name"]'),
    ).toHaveText(names[1]);
    const saved = await prisma.account.findMany({
      where: { groupId },
      orderBy: { sortOrder: "asc" },
    });
    expect(saved.map((row) => row.id)).toEqual(ids);
    await expect(
      dialog.getByRole("button", { name: "Try Again" }),
    ).toBeEnabled();
  });
  await dialog.getByRole("button", { name: "Try Again" }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(
    dialog.locator('.ag-row[row-index="0"] [col-id="name"]'),
  ).toHaveText(names[1]);
  await expect
    .poll(async () =>
      (
        await prisma.account.findMany({
          where: { groupId },
          orderBy: { sortOrder: "asc" },
        })
      ).map((row) => row.id),
    )
    .toEqual([...ids].reverse());
});

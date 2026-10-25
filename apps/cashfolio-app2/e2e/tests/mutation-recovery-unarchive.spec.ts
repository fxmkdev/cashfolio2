import { createId } from "@paralleldrive/cuid2";
import { expect, test } from "../support/fixtures";
import { seedDatabase, type SeededData } from "../support/db";
import { prisma } from "../support/db-client";
import { withBookLock } from "../support/book-lock";
import { ACCOUNT_BOOK_BUSY_MESSAGE } from "../../src/shared/mutation-errors";

let seeded: SeededData;

test.beforeEach(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
});

test("ledger unarchive displays busy rollback and succeeds only on explicit retry", async ({
  page,
}) => {
  const id = createId();
  const name = "Busy ledger unarchive";
  await prisma.account.create({
    data: {
      id,
      accountBookId: seeded.accountBookId,
      name,
      type: "BALANCE",
      isActive: false,
      unit: "CURRENCY",
      currency: "CHF",
    },
  });
  await page.goto(`/${seeded.accountBookId}/${id}`);
  await withBookLock(seeded.accountBookId, async () => {
    await page.getByRole("button", { name: "Account Actions" }).click();
    await page.getByRole("menuitem", { name: "Unarchive" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Waiting for another change to finish…",
    );
    await expect(page.getByRole("alert")).toHaveText(
      ACCOUNT_BOOK_BUSY_MESSAGE,
      { timeout: 35_000 },
    );
    await expect(
      page.getByText(`Unarchive ${name}`, { exact: true }),
    ).toBeVisible();
    expect(
      (
        await prisma.account.findUniqueOrThrow({
          where: {
            id_accountBookId: { id, accountBookId: seeded.accountBookId },
          },
        })
      ).isActive,
    ).toBe(false);
    await expect(page.getByRole("button", { name: "Try Again" })).toBeEnabled();
  });
  await page.getByRole("button", { name: "Try Again" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (
          await prisma.account.findUniqueOrThrow({
            where: {
              id_accountBookId: { id, accountBookId: seeded.accountBookId },
            },
          })
        ).isActive,
    )
    .toBe(true);
});

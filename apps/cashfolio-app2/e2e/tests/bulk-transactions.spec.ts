import { createId } from "@paralleldrive/cuid2";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../src/.prisma-client/enums";
import { prisma } from "../support/db-client";
import { seedDatabase, type SeededData } from "../support/db";
import { clickGridRowSelectionCheckbox } from "../support/grid";
import { selectAccountLeaf } from "../support/transaction-form";
import { expect, test, type Page } from "../support/fixtures";

let seeded: SeededData;
test.beforeAll(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
});

async function seedPair(label: string) {
  const make = (suffix: string, values: number[]) =>
    prisma.transaction.create({
      data: {
        id: createId(),
        accountBookId: seeded.accountBookId,
        description: `${label} ${suffix}`,
        bookings: {
          create: [
            ...values.map((value, index) => ({
              id: createId(),
              accountId: seeded.cashAccount.id,
              date: new Date("2026-05-10"),
              description: `${label} ${suffix} Cash ${index}`,
              unit: Unit.CURRENCY,
              currency: "CHF",
              value,
              sortOrder: index,
            })),
            {
              id: createId(),
              accountId: seeded.expenseAccount.id,
              date: new Date("2026-05-10"),
              description: `${label} ${suffix} Counter`,
              unit: Unit.CURRENCY,
              currency: "CHF",
              value: -values.reduce((sum, value) => sum + value, 0),
              sortOrder: values.length,
            },
          ],
        },
      },
      include: { bookings: true },
    });
  return [await make("First", [10, 20]), await make("Second", [40])];
}

async function selectIds(page: Page, ids: string[]) {
  for (const id of ids) {
    await clickGridRowSelectionCheckbox(
      page.locator(`.ag-row[row-id="${id}"]`).first(),
    );
  }
}

function cashBookingIds(transactions: Awaited<ReturnType<typeof seedPair>>) {
  return transactions.flatMap((transaction) =>
    transaction.bookings
      .filter((booking) => booking.accountId === seeded.cashAccount.id)
      .map((booking) => booking.id),
  );
}

async function openRebook(page: Page) {
  await page.getByRole("button", { name: "Rebook Selected" }).click();
  const dialog = page.getByRole("dialog", { name: "Rebook Bookings" });
  await dialog.getByLabel("Target Account").click();
  await selectAccountLeaf(page, seeded.savingsAccount.name);
  return dialog;
}

test("rebooks selected ledger bookings and deletes their unique whole transactions", async ({
  page,
}) => {
  const transactions = await seedPair("E2E Bulk Ledger");
  const bookingIds = cashBookingIds(transactions);
  await page.goto(
    `/${seeded.accountBookId}/${seeded.cashAccount.id}?period=2026-05`,
  );
  await selectIds(page, bookingIds);
  await expect(page.getByRole("status")).toContainText("3 bookings selected");
  const rebook = await openRebook(page);
  await expect(rebook).toContainText("Move 3 selected bookings");
  await rebook.getByRole("button", { name: "Rebook", exact: true }).click();
  await expect(rebook).not.toBeVisible();
  await expect(
    page.getByRole("toolbar", { name: "Selected Row Actions" }),
  ).toHaveCount(0);
  await expect
    .poll(async () =>
      (
        await prisma.booking.findMany({ where: { id: { in: bookingIds } } })
      ).map((booking) => booking.accountId),
    )
    .toEqual([
      seeded.savingsAccount.id,
      seeded.savingsAccount.id,
      seeded.savingsAccount.id,
    ]);
  expect(
    await prisma.booking.count({
      where: {
        transactionId: {
          in: transactions.map((transaction) => transaction.id),
        },
        accountId: seeded.expenseAccount.id,
      },
    }),
  ).toBe(2);

  await page.goto(
    `/${seeded.accountBookId}/${seeded.savingsAccount.id}?period=2026-05`,
  );
  await selectIds(page, bookingIds);
  await page.getByRole("button", { name: "Delete Selected" }).click();
  const deletion = page.getByRole("dialog", { name: "Delete Transactions" });
  await expect(deletion).toContainText("2 selected transactions");
  await expect(deletion).toContainText("including bookings in other accounts");
  await deletion.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("status")).toContainText("3 bookings selected");
  await expect(deletion).not.toBeVisible();
  await page.getByRole("button", { name: "Delete Selected" }).click();
  await deletion.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(deletion).not.toBeVisible();
  expect(
    await prisma.transaction.count({
      where: { id: { in: transactions.map((transaction) => transaction.id) } },
    }),
  ).toBe(0);
  expect(
    await prisma.booking.count({
      where: {
        transactionId: {
          in: transactions.map((transaction) => transaction.id),
        },
      },
    }),
  ).toBe(0);
});

test("deletes selected master transactions without offering bulk Rebook", async ({
  page,
}) => {
  const transactions = await seedPair("E2E Bulk Transactions");
  await page.goto(`/${seeded.accountBookId}/transactions?period=2026-05`);
  await selectIds(
    page,
    transactions.map((transaction) => transaction.id),
  );
  await expect(page.getByRole("status")).toContainText(
    "2 transactions selected",
  );
  await expect(
    page.getByRole("button", { name: "Rebook Selected" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Delete Selected" }).click();
  const deletion = page.getByRole("dialog", { name: "Delete Transactions" });
  await deletion.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(deletion).not.toBeVisible();
  expect(
    await prisma.transaction.count({
      where: { id: { in: transactions.map((transaction) => transaction.id) } },
    }),
  ).toBe(0);
});

test("keeps every transaction when a selected transaction becomes protected before Delete", async ({
  page,
}) => {
  const transactions = await seedPair("E2E Atomic Delete");
  await page.goto(`/${seeded.accountBookId}/transactions?period=2026-05`);
  await selectIds(
    page,
    transactions.map((transaction) => transaction.id),
  );
  await page.getByRole("button", { name: "Delete Selected" }).click();
  const opening = await prisma.account.create({
    data: {
      id: createId(),
      name: "E2E Opening Balances",
      accountBookId: seeded.accountBookId,
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
    },
  });
  await prisma.booking.update({
    where: {
      id_accountBookId: {
        accountBookId: seeded.accountBookId,
        id: transactions[1].bookings.find(
          (booking) => booking.accountId === seeded.expenseAccount.id,
        )!.id,
      },
    },
    data: { accountId: opening.id },
  });
  const deletion = page.getByRole("dialog", { name: "Delete Transactions" });
  await deletion.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(deletion.getByRole("alert")).toContainText(
    "Opening balance transactions",
  );
  expect(
    await prisma.transaction.count({
      where: { id: { in: transactions.map((transaction) => transaction.id) } },
    }),
  ).toBe(2);
  // Failed submissions refresh current constraints while preserving the dialog
  // snapshot. The newly protected row is removed from the live selection.
  await expect(deletion).toContainText("2 selected transactions");
  await expect(page.getByRole("status")).toContainText(
    "1 transaction selected",
  );
  await expect(
    page.locator(
      `.ag-row[row-id="${transactions[1].id}"] .ag-selection-checkbox input`,
    ),
  ).toBeDisabled();
  await deletion.getByRole("button", { name: "Cancel" }).click();
});

test("keeps every booking when the last selected booking becomes incompatible before Rebook", async ({
  page,
}) => {
  const transactions = await seedPair("E2E Atomic Rebook");
  const bookingIds = cashBookingIds(transactions);
  await page.goto(
    `/${seeded.accountBookId}/${seeded.cashAccount.id}?period=2026-05`,
  );
  await selectIds(page, bookingIds);
  const rebook = await openRebook(page);
  await prisma.booking.update({
    where: {
      id_accountBookId: {
        id: bookingIds[2],
        accountBookId: seeded.accountBookId,
      },
    },
    data: { currency: "USD" },
  });
  await rebook.getByRole("button", { name: "Rebook", exact: true }).click();
  await expect(rebook).toContainText(
    "Target account must use the same unit as the booking.",
  );
  expect(
    await prisma.booking.count({
      where: { id: { in: bookingIds }, accountId: seeded.cashAccount.id },
    }),
  ).toBe(3);
  await expect(page.getByRole("status")).toContainText("3 bookings selected");
});

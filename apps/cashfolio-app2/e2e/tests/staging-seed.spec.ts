import { Buffer } from "node:buffer";
import {
  generateStagingDataset,
  generateStatementImportSample,
} from "../../src/staging-seed/dataset";
import {
  insertSeedBooks,
  type SeedSummary,
} from "../../src/staging-seed/writer";
import { agGridRowByText, setGridAccountTreeCellValue } from "../support/grid";
import { assertSafeWriteTarget, prisma } from "../support/db-client";
import { expect, test } from "../support/fixtures";

const today = new Date("2026-10-10T00:00:00Z");
let seeded: SeedSummary;
let bankAccountId: string;

function seededBook(key: string) {
  const book = seeded.books.find((candidate) => candidate.key === key);
  if (!book) throw new Error(`Missing synthetic book ${key}.`);
  return book;
}

test.beforeAll(async ({ e2eExternalId }) => {
  assertSafeWriteTarget();
  const user = await prisma.user.upsert({
    where: { externalId: e2eExternalId },
    update: {},
    create: { externalId: e2eExternalId, locale: "en-CH" },
    select: { id: true },
  });
  // Add books only for this worker; never run staging's destructive replacement
  // against the shared E2E database or other workers' fixtures.
  seeded = await prisma.$transaction(
    (tx) => insertSeedBooks(tx, generateStagingDataset(today), [user]),
    { timeout: 120_000 },
  );
  const bank = await prisma.account.findFirstOrThrow({
    where: {
      accountBookId: seededBook("household").id,
      name: "Everyday account CHF",
    },
    select: { id: true },
  });
  bankAccountId = bank.id;
});

test("synthetic household data supports reports and three years of history", async ({
  page,
}) => {
  const household = seededBook("household");
  await page.goto(`/${household.id}/report?period=2026-10`);
  await expect(
    page.getByRole("heading", { name: "October 2026" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Contribution to Total Return" }),
  ).toBeVisible();
  await expect(page.getByTestId("period-breakdown-chart")).toBeVisible();
  await expect(
    page.getByText(
      /skipped because reference-currency balances were unavailable\./,
    ),
  ).toHaveCount(0);

  await page.goto(`/${household.id}/history?mode=year`);
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(page.locator(".ag-charts-wrapper canvas").first()).toBeVisible();
  await expect(page.getByText("No periods available yet.")).toHaveCount(0);
  await expect(
    page
      .getByRole("radiogroup", { name: "History Period Mode" })
      .getByRole("radio", { name: "Yearly" }),
  ).toBeChecked();
});

test("configured testers can switch to empty and valuation edge-case books", async ({
  page,
}) => {
  const household = seededBook("household");
  const empty = seededBook("empty");
  const edgeCases = seededBook("edge-cases");
  await page.goto(`/${household.id}/accounts?tab=ASSET&mode=active`);
  await page.getByRole("button", { name: household.name, exact: true }).click();
  await page.getByRole("menuitem", { name: empty.name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${empty.id}/accounts\\?`));
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add Account", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: empty.name, exact: true }).click();
  await page
    .getByRole("menuitem", { name: edgeCases.name, exact: true })
    .click();
  await page.goto(`/${edgeCases.id}/report?period=2026-10`);
  await expect(
    page.getByRole("heading", { name: "October 2026" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /skipped because reference-currency balances were unavailable\./,
    ),
  ).toBeVisible();
});

test("archived synthetic accounts remain available for archive workflows", async ({
  page,
}) => {
  await page.goto(
    `/${seededBook("household").id}/accounts?tab=ASSET&mode=archived`,
  );
  await expect(page.getByRole("heading", { name: "Archive" })).toBeVisible();
  await expect(agGridRowByText(page, "Closed bank account CHF")).toBeVisible();
});

test("the sample CSV imports into the configured synthetic bank account", async ({
  page,
}) => {
  const household = seededBook("household");
  await page.goto(`/${household.id}/${bankAccountId}/import-statement`);
  await expect(
    page.getByRole("heading", { name: "Import Statement" }),
  ).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic-statement.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(generateStatementImportSample(today)),
  });
  await expect(page.getByText("0 of 3 ready")).toBeVisible();
  const descriptions = [
    "Demo statement groceries",
    "Demo statement restaurant abroad",
    "Demo statement refund",
  ];
  const counterAccounts = ["Groceries", "Travel", "Freelance income"];
  for (let rowIndex = 0; rowIndex < descriptions.length; rowIndex += 1) {
    await expect(agGridRowByText(page, descriptions[rowIndex])).toBeVisible();
    await setGridAccountTreeCellValue({
      root: page,
      rowIndex,
      colId: "counterAccountId",
      accountName: counterAccounts[rowIndex],
    });
  }
  await expect(page.getByText("3 of 3 ready")).toBeVisible();
  await page.getByRole("button", { name: "Import Transactions" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/${household.id}/${bankAccountId}\\?`),
  );
  await expect(agGridRowByText(page, descriptions[0])).toBeVisible();
  expect(
    await prisma.transaction.count({
      where: { accountBookId: household.id, description: { in: descriptions } },
    }),
  ).toBe(3);
});

import { createId } from "@paralleldrive/cuid2";
import { selectSegmentedControlOption } from "../support/segmented-control";
import { agGridRowByText } from "../support/grid";
import { prisma } from "../support/db-client";
import { seedDatabase, type SeededData } from "../support/db";
import { expect, test, type Page } from "../support/fixtures";

let seeded: SeededData;
let incomeId: string;
let archivedId: string;
let openingId: string;
let gainLossId: string;

test.beforeAll(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
  async function category(
    name: string,
    subtype: "INCOME" | "EXPENSE" | "OPENING_BALANCES" | "GAIN_LOSS",
    isActive = true,
  ) {
    return prisma.account.create({
      data: {
        id: createId(),
        accountBookId: seeded.accountBookId,
        name,
        type: "EQUITY",
        equityAccountSubtype: subtype,
        isActive,
      },
    });
  }
  incomeId = (await category("E2E Navigation Salary", "INCOME")).id;
  archivedId = (await category("E2E Navigation Retired", "EXPENSE", false)).id;
  openingId = (await category("E2E Navigation Opening", "OPENING_BALANCES")).id;
  gainLossId = (
    await prisma.account.findFirstOrThrow({
      where: {
        accountBookId: seeded.accountBookId,
        equityAccountSubtype: "GAIN_LOSS",
      },
    })
  ).id;
  for (const [first, second, description] of [
    [seeded.cashAccount.id, seeded.expenseAccount.id, "E2E Navigation Expense"],
    [seeded.expenseAccount.id, incomeId, "E2E Navigation Reclassification"],
  ]) {
    await prisma.transaction.create({
      data: {
        id: createId(),
        accountBookId: seeded.accountBookId,
        description,
        bookings: {
          create: [first, second].map((accountId, index) => ({
            id: createId(),
            accountId,
            description,
            date: new Date("2026-01-15T00:00:00Z"),
            unit: "CURRENCY",
            currency: "CHF",
            value:
              (index === 0 ? -1 : 1) *
              (description.endsWith("Reclassification") ? 25 : 50),
            sortOrder: index,
          })),
        },
      },
    });
  }
});

async function expectNoSelectedSection(page: Page) {
  for (const name of [
    "Accounts",
    "Transactions",
    "Report",
    "History",
    "Settings",
  ]) {
    await expect(
      page.getByRole("link", { name, exact: true }),
    ).not.toHaveAttribute("data-active", "true");
  }
}

test("counterparty navigation preserves the immediate source across filters, reload and history", async ({
  page,
}) => {
  const cashUrl = `/${seeded.accountBookId}/${seeded.cashAccount.id}?period=2026-01#activity`;
  await page.goto(cashUrl);
  await expect(
    page.getByRole("link", { name: "Accounts", exact: true }),
  ).toHaveAttribute("data-active", "true");
  await page
    .getByRole("link", { name: seeded.expenseAccount.name, exact: true })
    .first()
    .click();
  await expectNoSelectedSection(page);
  await expect(
    page.getByText("Expense Category", { exact: true }),
  ).toBeVisible();
  const backToCash = page.getByRole("link", {
    name: `Back to ${seeded.cashAccount.name}`,
  });
  await expect(backToCash).toHaveAttribute("href", cashUrl);
  await page.reload();
  await expect(backToCash).toBeVisible();
  await page
    .getByRole("button", { name: "Previous Period", exact: true })
    .click();
  await expect(backToCash).toBeVisible();
  await backToCash.click();
  await expect(page).toHaveURL(cashUrl);
  await page.goForward();
  await expect(backToCash).toBeVisible();
  // The forward entry precedes the period change and includes January's links.
  await page
    .getByRole("link", { name: "E2E Navigation Salary", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("link", { name: `Back to ${seeded.expenseAccount.name}` }),
  ).toBeVisible();
  await expect(
    page.getByText("Income Category", { exact: true }),
  ).toBeVisible();
  await expectNoSelectedSection(page);
  await page
    .getByRole("link", { name: `Back to ${seeded.expenseAccount.name}` })
    .click();
  await expect(backToCash).toBeVisible();
});

test("direct category and system visits have neutral navigation and only editable categories can be managed", async ({
  page,
}) => {
  for (const [id, badge, menu] of [
    [openingId, "System Account", "Account Actions"],
    [gainLossId, "System-Managed Category", "Category Actions"],
    [archivedId, "Expense Category", "Category Actions"],
  ]) {
    await page.goto(`/${seeded.accountBookId}/${id}`);
    await expect(page.getByText(badge, { exact: true })).toBeVisible();
    await expectNoSelectedSection(page);
    await expect(page.getByRole("link", { name: /^Back to/ })).toHaveCount(0);
    await page.getByRole("button", { name: menu, exact: true }).click();
    if (id === archivedId) {
      await page
        .getByRole("menuitem", { name: "Manage Category", exact: true })
        .click();
      await expect(page).toHaveURL(
        new RegExp(
          `/settings/categories\\?tab=EQUITY-EXPENSE&showArchived=true$`,
        ),
      );
      await expect(
        page.getByRole("checkbox", { name: "Show Archived" }),
      ).toBeChecked();
      await expect(
        page.getByRole("link", { name: "Settings", exact: true }),
      ).toHaveAttribute("data-active", "true");
    } else {
      await expect(
        page.getByRole("menuitem", { name: "Manage Category", exact: true }),
      ).toHaveCount(0);
    }
  }
});

test("transaction links return to the original transaction period", async ({
  page,
}) => {
  const source = `/${seeded.accountBookId}/transactions?period=2026-01`;
  await page.goto(source);
  await page
    .getByRole("link", { name: seeded.expenseAccount.name, exact: true })
    .first()
    .click();
  const back = page.getByRole("link", { name: "Back to Transactions" });
  await expect(back).toHaveAttribute("href", source);
  await expectNoSelectedSection(page);
  await back.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(source);
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [1280, 390]) {
    test(`ledger return context ${colorScheme} ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(
        `/${seeded.accountBookId}/${seeded.cashAccount.id}?period=2026-01`,
      );
      await page
        .getByRole("link", { name: seeded.expenseAccount.name, exact: true })
        .first()
        .click();
      await expect(
        page.getByRole("link", { name: `Back to ${seeded.cashAccount.name}` }),
      ).toBeVisible();
      await expect(
        page.getByText("Expense Category", { exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath("category-ledger.png"),
        animations: "disabled",
      });
    });
  }
}

test("income category management retains its tab and fresh archive default", async ({
  page,
}) => {
  const source = `/${seeded.accountBookId}/settings/categories?tab=EQUITY-INCOME&showArchived=false`;
  await page.goto(source);
  await agGridRowByText(page, "E2E Navigation Salary").dblclick();
  const back = page.getByRole("link", { name: "Back to Categories" });
  await expect(back).toHaveAttribute("href", source);
  await expectNoSelectedSection(page);
  await page
    .getByRole("button", { name: "Category Actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Manage Category", exact: true })
    .click();
  await expect(page).toHaveURL(source);
  await expect(
    page.getByRole("checkbox", { name: "Show Archived" }),
  ).not.toBeChecked();
});

test("report category drilldown returns to the selected report period", async ({
  page,
}) => {
  const source = `/${seeded.accountBookId}/report?period=2026-01`;
  await page.goto(source);
  await selectSegmentedControlOption(
    page.getByRole("radiogroup", { name: "Breakdown Type", exact: true }),
    "Expenses",
  );
  await selectSegmentedControlOption(
    page.getByRole("radiogroup", { name: "Breakdown Chart Type", exact: true }),
    "Table",
  );
  const table = page.getByTestId("period-breakdown-table");
  await expect(table).toBeVisible();
  const group = table
    .locator(".ag-row")
    .filter({ hasText: "E2E Expenses" })
    .first();
  const expand = group.locator(".ag-group-contracted").first();
  if (await expand.isVisible()) await expand.click();
  await table.getByText(seeded.expenseAccount.name, { exact: true }).dblclick();
  const back = page.getByRole("link", { name: "Back to Report" });
  await expect(back).toHaveAttribute("href", source);
  await expectNoSelectedSection(page);
  await back.click();
  await expect(page).toHaveURL(source);
});

test("return navigation falls back to the validated URL without a usable history index", async ({
  page,
}) => {
  const source = `/${seeded.accountBookId}/settings/categories?tab=EQUITY-INCOME&showArchived=false`;
  await page.goto(`/${seeded.accountBookId}/${incomeId}`);
  await page.evaluate(
    (href) =>
      history.replaceState(
        { ...history.state, ledgerReturnTarget: { href, label: "Categories" } },
        "",
      ),
    source,
  );
  await page.reload();
  await page.getByRole("link", { name: "Back to Categories" }).click();
  await expect(page).toHaveURL(source);
});

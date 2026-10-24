import { createId } from "@paralleldrive/cuid2";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../src/.prisma-client/enums";
import { prisma } from "../support/db-client";
import { seedDatabase, type SeededData } from "../support/db";
import { expect, test } from "../support/fixtures";
import { selectSegmentedControlOption } from "../support/segmented-control";

let seeded: SeededData;
let cardId: string;

test.beforeAll(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({
    userExternalId: e2eExternalId,
    accountBookStartDate: new Date("2026-01-01T00:00:00Z"),
  });
  cardId = createId();
  await prisma.account.create({
    data: {
      id: cardId,
      accountBookId: seeded.accountBookId,
      name: "Reporting Credit Card",
      type: AccountType.LIABILITY,
      unit: Unit.CURRENCY,
      currency: "CHF",
    },
  });
  const income = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId: seeded.accountBookId,
      name: "Reporting Income",
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.INCOME,
    },
  });
  for (const [month, bankChange, cardChange] of [
    ["01", 100, -40],
    ["02", -100, 40],
    ["03", -50, 20],
  ] as const) {
    for (const [accountId, value] of [
      [seeded.cashAccount.id, bankChange],
      [cardId, cardChange],
    ] as const) {
      const description = `Reporting balance change ${month} ${value}`;
      const date = new Date(`2026-${month}-10T00:00:00Z`);
      await prisma.transaction.create({
        data: {
          id: createId(),
          accountBookId: seeded.accountBookId,
          description,
          bookings: {
            create: [
              {
                id: createId(),
                accountId,
                value,
                date,
                description,
                unit: Unit.CURRENCY,
                currency: "CHF",
                sortOrder: 0,
              },
              {
                id: createId(),
                accountId: value > 0 ? income.id : seeded.expenseAccount.id,
                value: -value,
                date,
                description,
                unit: Unit.CURRENCY,
                currency: "CHF",
                sortOrder: 1,
              },
            ],
          },
        },
      });
    }
  }
});

test("Report moves overdrafts and overpayments between allocation sides and preserves ledger navigation", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/report?period=2026-03`);
  const allocationType = page.getByRole("radiogroup", {
    name: "Allocation Type",
  });
  await selectSegmentedControlOption(
    page.getByRole("radiogroup", { name: "Allocation Chart Type" }),
    "Table",
  );
  const table = page.getByTestId("period-allocation-breakdown-table");
  await expect(
    table.getByText("Reporting Credit Card", { exact: true }),
  ).toBeVisible();
  await expect(
    table.getByText(seeded.cashAccount.name, { exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByText("As of period end (last day)", { exact: true })
      .locator("..")
      .getByText("Assets", { exact: true })
      .locator(".."),
  ).toContainText("20.00");
  await expect(
    page
      .getByText("As of period end (last day)", { exact: true })
      .locator("..")
      .getByText("Liabilities", { exact: true })
      .locator(".."),
  ).toContainText("50.00");
  await expect(
    page
      .getByText("As of period end (last day)", { exact: true })
      .locator("..")
      .getByText("Net Worth", { exact: true })
      .locator(".."),
  ).toContainText("30.00");
  await expect(page.getByText(/excluded from allocation/)).toHaveCount(0);
  await selectSegmentedControlOption(allocationType, "Liabilities");
  const bankRow = table.getByText(seeded.cashAccount.name, { exact: true });
  await expect(bankRow).toBeVisible();
  await expect(
    table.getByText("Reporting Credit Card", { exact: true }),
  ).toHaveCount(0);
  await bankRow.dblclick();
  await expect(page).toHaveURL(
    new RegExp(
      `/${seeded.accountBookId}/${seeded.cashAccount.id}.*period=2026-03`,
    ),
  );
  await expect(page.getByTestId("period-picker-trigger")).toContainText(
    "March 2026",
  );
  await expect(
    page.getByText("Reporting balance change 03 -50").first(),
  ).toBeVisible();
});

test("History retains accounts on either side across zero crossings in monthly and yearly views", async ({
  page,
}) => {
  for (const [metric, scopeKey, accountId, accountName] of [
    ["assets", "assetScope", cardId, "Reporting Credit Card"],
    [
      "liabilities",
      "liabilityScope",
      seeded.cashAccount.id,
      seeded.cashAccount.name,
    ],
  ] as const) {
    for (const mode of ["month", "year"] as const) {
      await page.goto(
        `/${seeded.accountBookId}/history?mode=${mode}&metric=${metric}&${scopeKey}=account:${accountId}`,
      );
      await expect(page.getByRole("textbox", { name: "View" })).toHaveValue(
        accountName,
      );
      await expect(
        page.getByText("Double-click a period to open ledger."),
      ).toBeVisible();
      expect(new URL(page.url()).searchParams.get(scopeKey)).toBe(
        `account:${accountId}`,
      );
    }
  }
});

test("Report excludes zero balances and shows the correct side at each period end", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/report?period=2026-02`);
  await expect(
    page.getByText(
      "No positive, convertible account balances were found as of period end.",
    ),
  ).toBeVisible();
  await selectSegmentedControlOption(
    page.getByRole("radiogroup", { name: "Allocation Type" }),
    "Liabilities",
  );
  await expect(
    page.getByText(
      "No negative, convertible account balances were found as of period end.",
    ),
  ).toBeVisible();
  await page.goto(`/${seeded.accountBookId}/report?period=2026-01`);
  await expect(
    page
      .getByText("As of period end (last day)", { exact: true })
      .locator("..")
      .getByText("Assets", { exact: true })
      .locator(".."),
  ).toContainText("100.00");
  await expect(
    page
      .getByText("As of period end (last day)", { exact: true })
      .locator("..")
      .getByText("Liabilities", { exact: true })
      .locator(".."),
  ).toContainText("40.00");
});

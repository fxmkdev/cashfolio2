import { createId } from "@paralleldrive/cuid2";
import { Unit } from "../../src/.prisma-client/enums";
import { prisma } from "../support/db-client";
import {
  seedDatabase,
  seedExplicitGainLossDrilldownScenario,
  seedSecurityGainLossDrilldownScenario,
  type SeededData,
} from "../support/db";
import { expect, test, type Page } from "../support/fixtures";

let seeded: SeededData;

test.beforeAll(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({
    userExternalId: e2eExternalId,
    accountBookStartDate: new Date("2026-01-01T00:00:00Z"),
  });
  for (const [period, amount] of [
    ["2026-01", 40],
    ["2026-02", 60],
    ["2027-01", 90],
  ] as const) {
    const description = `History drill expense ${period}`;
    await prisma.transaction.create({
      data: {
        id: createId(),
        accountBookId: seeded.accountBookId,
        description,
        bookings: {
          create: [
            {
              id: createId(),
              accountId: seeded.expenseAccount.id,
              date: new Date(`${period}-10T00:00:00Z`),
              description,
              value: -amount,
              unit: Unit.CURRENCY,
              currency: "CHF",
              sortOrder: 0,
            },
            {
              id: createId(),
              accountId: seeded.savingsAccount.id,
              date: new Date(`${period}-10T00:00:00Z`),
              description,
              value: amount,
              unit: Unit.CURRENCY,
              currency: "CHF",
              sortOrder: 1,
            },
          ],
        },
      },
    });
  }
  await seedSecurityGainLossDrilldownScenario({
    accountBookId: seeded.accountBookId,
    securityAccountId: seeded.securityAccount.id,
    counterAccountId: seeded.cashAccount.id,
  });
  await seedExplicitGainLossDrilldownScenario({
    accountBookId: seeded.accountBookId,
    counterAccountId: seeded.cashAccount.id,
  });
});

// Use the chart's keyboard focus indicator to locate a real rendered datum,
// then double-click it with the mouse. This avoids fixed canvas coordinates.
async function doubleClickHistoryPoint(
  page: Page,
  pointIndex: number,
  isBalancePoint = false,
) {
  await expect(page.locator(".ag-charts-wrapper canvas").first()).toBeVisible();
  const allRange = page
    .locator(".ag-charts-range-buttons--buttons .ag-charts-toolbar__button")
    .filter({ hasText: /^All$/ });
  await allRange.click();
  await page.locator(".ag-charts-series-area").focus();
  await page.keyboard.press("Home");
  for (let index = 0; index < pointIndex; index++)
    await page.keyboard.press("ArrowRight");
  const focusedPoint = page
    .locator(
      ".ag-charts-focus-indicator > div, .ag-charts-focus-svg-inner-path",
    )
    .first();
  await expect(focusedPoint).toBeVisible();
  const box = await focusedPoint.boundingBox();
  expect(box).not.toBeNull();
  // A rolling-average marker can overlap the bar's midpoint. Click inside the
  // bar away from that overlay; balance markers use their center.
  await page.mouse.dblclick(
    box!.x + box!.width / 2,
    box!.y + box!.height * (isBalancePoint ? 0.5 : 0.8),
  );
}

async function expectPeriodDestination(
  page: Page,
  path: string,
  period: string,
) {
  await expect
    .poll(() => ({
      path: new URL(page.url()).pathname,
      period: new URL(page.url()).searchParams.get("period"),
    }))
    .toEqual({
      path,
      period: /^\d{4}$/.test(period) ? JSON.stringify(period) : period,
    });
}

test("monthly expense bar opens only that month and Back restores History scope", async ({
  page,
}) => {
  const historyPath = `/${seeded.accountBookId}/history?metric=expenses&expenseScope=account:${seeded.expenseAccount.id}`;
  await page.goto(historyPath);
  await expect(
    page.getByText("Double-click a period to open ledger."),
  ).toBeVisible();
  await doubleClickHistoryPoint(page, 0);
  await expectPeriodDestination(
    page,
    `/${seeded.accountBookId}/${seeded.expenseAccount.id}`,
    "2026-01",
  );
  await expect(page.getByTestId("period-picker-trigger")).toContainText(
    "January 2026",
  );
  await expect(page.getByText("History drill expense 2026-01")).toBeVisible();
  await expect(page.getByText("History drill expense 2026-02")).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "View" })).toHaveValue(
    seeded.expenseAccount.name,
  );
  expect(new URL(page.url()).searchParams.get("expenseScope")).toBe(
    `account:${seeded.expenseAccount.id}`,
  );
  expect(new URL(page.url()).searchParams.get("mode")).toBeNull();
});

test("yearly account bar opens the whole year and excludes future-year bookings", async ({
  page,
}) => {
  await page.goto(
    `/${seeded.accountBookId}/history?mode=year&metric=expenses&expenseScope=account:${seeded.expenseAccount.id}`,
  );
  await doubleClickHistoryPoint(page, 0);
  await expectPeriodDestination(
    page,
    `/${seeded.accountBookId}/${seeded.expenseAccount.id}`,
    "2026",
  );
  await expect(page.getByTestId("period-picker-trigger")).toContainText("2026");
  await expect(page.getByText("History drill expense 2026-01")).toBeVisible();
  await expect(page.getByText("History drill expense 2026-02")).toBeVisible();
  await expect(page.getByText("History drill expense 2027-01")).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole("radio", { name: "Yearly" })).toBeChecked();
});

test("asset balance point opens ledger for that period", async ({ page }) => {
  await page.goto(
    `/${seeded.accountBookId}/history?metric=assets&assetScope=account:${seeded.savingsAccount.id}`,
  );
  // Balance charts start with a synthetic opening-balance point.
  await doubleClickHistoryPoint(page, 2, true);
  await expectPeriodDestination(
    page,
    `/${seeded.accountBookId}/${seeded.savingsAccount.id}`,
    "2026-02",
  );
  await expect(page.getByText("History drill expense 2026-02")).toBeVisible();
  await expect(page.getByText("History drill expense 2026-01")).toHaveCount(0);
});

test("Gain/Loss unit account bar opens period reconciliation", async ({
  page,
}) => {
  await page.goto(
    `/${seeded.accountBookId}/history?metric=gainsLosses&gainLossScope=unit-account:security:AAPL:USD:${seeded.securityAccount.id}`,
  );
  await expect(
    page.getByText("Double-click a period to open gain/loss reconciliation."),
  ).toBeVisible();
  await doubleClickHistoryPoint(page, 1);
  await expectPeriodDestination(
    page,
    `/${seeded.accountBookId}/report/gains-losses/${seeded.securityAccount.id}`,
    "2026-02",
  );
  await expect(
    page.getByText("E2E Security Gain/Loss Sell").first(),
  ).toBeVisible();
});

test("legacy recorded G/L scope opens the unified account explanation", async ({ page }) => {
  await page.goto(
    `/${seeded.accountBookId}/history?metric=gainsLosses&gainLossScope=explicit-account:${seeded.cashAccount.id}`,
  );
  await doubleClickHistoryPoint(page, 0);
  await expectPeriodDestination(
    page,
    `/${seeded.accountBookId}/report/gains-losses/${seeded.cashAccount.id}`,
    "2026-01",
  );
  await expect(page.getByRole("heading", { name: "Recorded Adjustments" })).toBeVisible();
  await expect(page.getByText("E2E Explicit Gain/Loss Seed")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Accounts", exact: true }),
  ).not.toHaveAttribute("data-active", "true");
  await page.getByRole("link", { name: "Back to History" }).click();
  await expect(new URL(page.url()).searchParams.get("gainLossScope")).toBe(
    `explicit-account:${seeded.cashAccount.id}`,
  );
});

test("empty asset period before first booking stays selected after refresh", async ({
  page,
}) => {
  await page.goto(
    `/${seeded.accountBookId}/${seeded.securityAccount.id}?period=2026-01&source=period-filter&transactionId=missing`,
  );
  await expect(page.getByTestId("period-picker-trigger")).toContainText(
    "January 2026",
  );
  await expectPeriodDestination(
    page,
    `/${seeded.accountBookId}/${seeded.securityAccount.id}`,
    "2026-01",
  );
  await expect(page.getByText("E2E Security Gain/Loss Buy")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Previous Period" }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId("period-picker-trigger")).toContainText(
    "January 2026",
  );
  await page.getByRole("button", { name: "Next Period" }).click();
  await expectPeriodDestination(
    page,
    `/${seeded.accountBookId}/${seeded.securityAccount.id}`,
    "2026-02",
  );
  expect(new URL(page.url()).searchParams.get("source")).toBe("period-filter");
  expect(new URL(page.url()).searchParams.get("transactionId")).toBeNull();
  await expect(page.getByText("E2E Security Gain/Loss Buy")).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId("period-picker-trigger")).toContainText(
    "January 2026",
  );
  await page.goForward();
  await expect(page.getByTestId("period-picker-trigger")).toContainText(
    "February 2026",
  );
  await page.getByTestId("period-picker-trigger").click();
  const picker = page.getByTestId("period-month-picker");
  await expect(picker.getByRole("button", { name: /Jan/i })).toBeDisabled();
  await page.getByRole("button", { name: "Clear Filter" }).click();
  await expect(page.getByTestId("period-picker-trigger")).toContainText(
    "All Periods",
  );
  expect(new URL(page.url()).searchParams.get("period")).toBeNull();
  expect(new URL(page.url()).searchParams.get("source")).toBe("period-filter");
});

test("aggregate History scope does not advertise account drill-down", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/history?metric=expenses`);
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(page.getByText(/Double-click a period to open/)).toHaveCount(0);
});

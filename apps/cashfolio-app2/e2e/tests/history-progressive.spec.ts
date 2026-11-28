import {
  seedDatabase,
  seedThreeBookingSplitTransaction,
  type SeededData,
} from "../support/db";
import { expect, test } from "../support/fixtures";

let seeded: SeededData;

test.beforeEach(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
  await seedThreeBookingSplitTransaction({
    accountBookId: seeded.accountBookId,
    description: "E2E Progressive History Seed",
    currentAccountId: seeded.cashAccount.id,
    debitAccountIds: [seeded.expenseAccount.id, seeded.expenseAccount.id],
  });
});

for (const failOlder of [false, true]) {
  test(`History publishes recent data before older history ${failOlder ? "fails" : "finishes"}`, async ({
    page,
  }) => {
    let requests = 0;
    let release!: () => void;
    let ready!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      ready = resolve;
    });
    await page.route("**/_serverFn/**", async (route) => {
      if (!route.request().url().includes("granularity"))
        return route.continue();
      requests++;
      if (requests !== 3) return route.continue();
      ready();
      await gate;
      if (failOlder)
        return route.fulfill({
          status: 500,
          contentType: "text/plain",
          body: "Earlier history failed.",
        });
      return route.continue();
    });
    await page.goto(`/${seeded.accountBookId}/history`);
    const chart = page.locator(".ag-charts-wrapper canvas").first();
    const all = page
      .locator(".ag-charts-range-buttons--buttons .ag-charts-toolbar__button")
      .filter({ hasText: /^All$/ });
    const view = page.getByRole("textbox", { name: "View" });
    try {
      await pending;
      await expect(chart).toBeVisible();
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "Loading earlier history…" }),
      ).toBeVisible();
      await expect(all).toBeDisabled();
      await expect(view).toBeEnabled();
      await expect(
        page.getByTestId("global-loading-indicator"),
      ).not.toHaveAttribute("data-mounted");
      for (const metric of ["Income", "Expenses", "Assets", "Total Return"]) {
        await view.click();
        await view.fill(metric);
        await page
          .getByRole("option")
          .filter({ hasText: new RegExp(`^${metric}$`) })
          .first()
          .click();
        await expect(view).toHaveValue(metric);
        await expect(view).toBeEnabled();
      }
      expect(requests).toBe(3);
    } finally {
      release();
    }
    if (failOlder) {
      await expect(
        page.getByRole("button", { name: "Retry History" }),
      ).toBeVisible();
      await expect(chart).toBeVisible();
      await expect(all).toBeDisabled();
      await page.getByRole("button", { name: "Retry History" }).click();
    }
    await expect(page.getByText("Loading earlier history…")).toHaveCount(0);
    await expect(all).toBeEnabled();
    await all.click();
    await expect(all).toHaveClass(/ag-charts-toolbar__button--active/);
  });
}

test("aggregate metric changes reuse completed History without another request", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/_serverFn/**", (route) => {
    if (route.request().url().includes("granularity")) requests++;
    return route.continue();
  });
  await page.goto(`/${seeded.accountBookId}/history`);
  const all = page
    .locator(".ag-charts-range-buttons--buttons .ag-charts-toolbar__button")
    .filter({ hasText: /^All$/ });
  await expect(all).toBeEnabled();
  const completedRequests = requests;
  const view = page.getByRole("textbox", { name: "View" });
  for (const metric of [
    "Income",
    "Expenses",
    "Assets",
    "Liabilities",
    "Net Worth",
    "Total Return",
  ]) {
    await view.click();
    await view.fill(metric);
    await page
      .getByRole("option")
      .filter({ hasText: new RegExp(`^${metric}$`) })
      .first()
      .click();
    await expect(view).toHaveValue(metric);
    await expect(view).toBeEnabled();
  }
  expect(requests).toBe(completedRequests);
});

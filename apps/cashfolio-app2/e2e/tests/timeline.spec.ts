import { expect, test, type Page } from "@playwright/test";
import { seedDatabase, type SeededData } from "../support/db";

let seeded: SeededData;

test.beforeAll(async () => {
  seeded = await seedDatabase();
});

function getTimelinePeriodModeSelect(page: Page) {
  return page.getByRole("combobox", {
    name: "Timeline period mode",
  });
}

async function selectTimelinePeriodMode(args: {
  page: Page;
  label: "Monthly" | "Yearly";
}) {
  const control = getTimelinePeriodModeSelect(args.page);
  await control.click();
  await args.page
    .getByRole("option", { name: args.label, exact: true })
    .click();
  await expect(control).toHaveValue(args.label);
}

test("timeline page is reachable and persists selected period mode across refresh", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();

  await page.getByRole("link", { name: "Timeline" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/timeline$`),
  );
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();

  const periodModeControl = getTimelinePeriodModeSelect(page);
  await selectTimelinePeriodMode({ page, label: "Yearly" });

  const chartCanvas = page.locator(".ag-charts-wrapper canvas").first();
  await expect(chartCanvas).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(periodModeControl).toHaveValue("Yearly");

  await page.getByRole("link", { name: "Period" }).click();
  await expect(page).toHaveURL(new RegExp(`/${seeded.accountBookId}/period$`));
  await expect(page.getByRole("heading", { name: "Period" })).toBeVisible();
});

test("timeline mode toggles update URL mode and keep history compact", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();

  await page.getByRole("link", { name: "Timeline" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/timeline$`),
  );

  const periodModeControl = getTimelinePeriodModeSelect(page);

  await selectTimelinePeriodMode({ page, label: "Yearly" });
  await expect(periodModeControl).toHaveValue("Yearly");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("mode"))
    .toBe("year");

  await selectTimelinePeriodMode({ page, label: "Monthly" });
  await expect(periodModeControl).toHaveValue("Monthly");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("mode"))
    .toBeNull();

  await page.goBack();
  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/accounts\\?tab=ASSET&mode=active$`),
  );
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
});

test("timeline deep link with yearly mode selects yearly on first load", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/timeline?mode=year`);
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();

  const periodModeControl = getTimelinePeriodModeSelect(page);
  await expect(periodModeControl).toHaveValue("Yearly");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("mode"))
    .toBe("year");
});

test("timeline shows chart data for the account-book period range", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/timeline`);
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(page.locator(".ag-charts-wrapper canvas").first()).toBeVisible();
  await expect(page.getByText("No periods available yet.")).toHaveCount(0);
});

test("timeline deep link with invalid mode falls back to monthly", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/timeline?mode=weekly`);
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();

  const periodModeControl = getTimelinePeriodModeSelect(page);
  await expect(periodModeControl).toHaveValue("Monthly");
  await expect(periodModeControl).not.toHaveValue("Yearly");
});

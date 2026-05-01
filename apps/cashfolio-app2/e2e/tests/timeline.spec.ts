import { expect, test } from "@playwright/test";
import { resetAndSeedDatabase, type SeededData } from "../support/db";
import { selectSegmentedControlOption } from "../support/segmented-control";

let seeded: SeededData;

test.beforeAll(async () => {
  seeded = await resetAndSeedDatabase();
});

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

  const periodModeControl = page.getByRole("radiogroup", {
    name: "Timeline period mode",
  });
  await selectSegmentedControlOption(periodModeControl, "Yearly");

  const chartCanvas = page.locator(".ag-charts-wrapper canvas").first();
  await expect(chartCanvas).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(
    periodModeControl.getByRole("radio", { name: "Yearly" }),
  ).toBeChecked();

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

  const periodModeControl = page.getByRole("radiogroup", {
    name: "Timeline period mode",
  });

  await selectSegmentedControlOption(periodModeControl, "Yearly");
  await expect(
    periodModeControl.getByRole("radio", { name: "Yearly" }),
  ).toBeChecked();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("mode"))
    .toBe("year");

  await selectSegmentedControlOption(periodModeControl, "Monthly");
  await expect(
    periodModeControl.getByRole("radio", { name: "Monthly" }),
  ).toBeChecked();
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

  const periodModeControl = page.getByRole("radiogroup", {
    name: "Timeline period mode",
  });
  await expect(
    periodModeControl.getByRole("radio", { name: "Yearly" }),
  ).toBeChecked();
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

  const periodModeControl = page.getByRole("radiogroup", {
    name: "Timeline period mode",
  });
  await expect(
    periodModeControl.getByRole("radio", { name: "Monthly" }),
  ).toBeChecked();
  await expect(
    periodModeControl.getByRole("radio", { name: "Yearly" }),
  ).not.toBeChecked();
});

test("timeline empty state is shown when no periods are available", async ({
  page,
}) => {
  const tomorrow = new Date();
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const emptyStateSeeded = await resetAndSeedDatabase({
    accountBookStartDate: tomorrow,
  });

  await page.goto(`/${emptyStateSeeded.accountBookId}/timeline`);
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(page.getByText("No periods available yet.")).toBeVisible();
  await expect(page.locator(".ag-charts-wrapper canvas")).toHaveCount(0);
});

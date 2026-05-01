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

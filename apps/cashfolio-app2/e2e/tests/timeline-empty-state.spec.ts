import { expect, test } from "@playwright/test";
import { resetAndSeedDatabase } from "../support/db";

let accountBookId: string;

test.beforeAll(async () => {
  const now = new Date();
  const futureStartDate = new Date(
    Date.UTC(now.getUTCFullYear() + 1, 0, 1, 0, 0, 0, 0),
  );

  const seeded = await resetAndSeedDatabase({
    accountBookStartDate: futureStartDate,
  });
  accountBookId = seeded.accountBookId;
});

test("timeline empty state is shown when no periods are available", async ({
  page,
}) => {
  await page.goto(`/${accountBookId}/timeline`);
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(page.getByText("No periods available yet.")).toBeVisible();
  await expect(page.locator(".ag-charts-wrapper canvas")).toHaveCount(0);
});

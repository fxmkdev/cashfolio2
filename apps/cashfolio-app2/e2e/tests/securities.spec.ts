import { seedDatabase } from "../support/db";
import { seedSecuritiesCatalogue } from "../support/securities-seed";
import { expect, test } from "../support/fixtures";
import { selectSegmentedControlOption } from "../support/segmented-control";
let accountBookId: string;
test.beforeAll(async ({ e2eExternalId }) => {
  accountBookId = (await seedDatabase({ userExternalId: e2eExternalId }))
    .accountBookId;
  await seedSecuritiesCatalogue();
});
test("Securities sidebar navigation, exact exchange details and locally selected chart ranges", async ({
  page,
}) => {
  await page.goto(`/${accountBookId}/accounts`);
  await page.getByRole("link", { name: "Securities", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${accountBookId}/securities$`));
  await expect(page).toHaveTitle(/Securities/);
  await expect(
    page.getByRole("heading", { name: "Securities", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Security", exact: true })
    .fill("E2E.SEC");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByLabel("Result Count")).toHaveText(
    "Showing 2 of 2 listings",
  );
  await page.locator('[row-id="e2e-security-xswx"] [col-id="name"]').click();
  const details = page.getByRole("region", { name: "Security Details" });
  await expect(
    details.getByText("SIX Swiss Exchange (XSWX)", { exact: true }),
  ).toBeVisible();
  await expect(details.getByLabel("Latest Closing Price")).toContainText("CHF");
  await expect(
    details.getByRole("img", { name: /closing price chart/ }),
  ).toBeVisible();
  const initialPeriod = await details.getByLabel("Chart Period").textContent();
  await selectSegmentedControlOption(details, "5Y");
  await expect(details.getByLabel("Chart Period")).not.toHaveText(
    initialPeriod!,
  );
  await selectSegmentedControlOption(details, "1M");
  await expect(
    details.getByRole("radio", { name: "1M", exact: true }),
  ).toBeChecked();
  await details.getByRole("button", { name: "Close Details" }).click();
  await expect(details).toHaveCount(0);
  await expect(
    page.locator('[row-id="e2e-security-xswx"] [col-id="name"]'),
  ).toBeFocused();
});

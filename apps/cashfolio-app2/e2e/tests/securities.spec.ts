import { seedDatabase } from "../support/db";
import { prisma } from "../support/db-client";
import { expect, test } from "../support/fixtures";
import { selectSegmentedControlOption } from "../support/segmented-control";
let accountBookId: string;
test.beforeAll(async ({ e2eExternalId }) => {
  accountBookId = (await seedDatabase({ userExternalId: e2eExternalId }))
    .accountBookId;
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
  await expect(page.getByLabel("Result Count")).toHaveText("2 listings");
  await page
    .locator('[row-id] [col-id="name"]')
    .filter({ hasText: "E2E Example Security" })
    .nth(1)
    .click();
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
    page
      .locator('[row-id] [col-id="name"]')
      .filter({ hasText: "E2E Example Security" })
      .nth(1),
  ).toBeFocused();
});

test("partial history crosses the server boundary without losing valid prices or metadata", async ({
  page,
}) => {
  await page.goto(`/${accountBookId}/securities`);
  await page
    .getByRole("textbox", { name: "Security", exact: true })
    .fill("E2E.PARTIAL");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .locator('[row-id] [col-id="name"]')
    .filter({ hasText: "E2E Partial History ETF" })
    .click();
  const details = page.getByRole("region", { name: "Security Details" });
  await expect(
    details.getByText("Partial Price History", { exact: true }),
  ).toBeVisible();
  await expect(
    details.getByText(/2 closing price observations are unavailable/),
  ).toBeVisible();
  await expect(details.getByLabel("Latest Closing Price")).toContainText(
    "160.00 CHF",
  );
  await expect(
    details.getByRole("img", { name: /closing price chart/ }),
  ).toBeVisible();
  await expect(details.getByText("ETF", { exact: true })).toBeVisible();
  await expect(
    details.getByRole("button", { name: "Retry Price History" }),
  ).toHaveCount(0);
});

test("search is explicit, exchange selection is submitted and pagination does not load history", async ({
  page,
}) => {
  const attempts = () =>
    prisma.valuationProviderRequest.count({
      where: {
        provider: "MARKETSTACK",
        requestReason: { in: ["SECURITY_SEARCH", "SECURITY_HISTORY"] },
      },
    });
  const historyAttempts = () =>
    prisma.valuationProviderRequest.count({
      where: { provider: "MARKETSTACK", requestReason: "SECURITY_HISTORY" },
    });
  const before = await attempts();
  await page.goto(`/${accountBookId}/securities`);
  const input = page.getByRole("textbox", { name: "Security", exact: true });
  await input.fill("E2E.PAGE");
  await expect(page.getByLabel("Submitted Search")).toHaveCount(0);
  expect(await attempts()).toBe(before);
  await input.press("Enter");
  await expect(page.getByLabel("Result Count")).toHaveText("24 listings");
  const historyBefore = await historyAttempts();
  await page.getByRole("button", { name: "Next Page" }).click();
  await expect(
    page
      .locator('[row-id] [col-id="symbol"]')
      .filter({ hasText: "E2E.PAGE.21" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Page 2", exact: true }),
  ).toHaveAttribute("data-active");
  expect(await historyAttempts()).toBe(historyBefore);
  const header = page.getByRole("columnheader", { name: /^Symbol/ });
  await header.click();
  await expect(header).not.toHaveAttribute("aria-sort");
  await expect(page.locator(".ag-header-cell-filter-button")).toHaveCount(0);
  await input.fill("E2E.SEC");
  const exchange = page.getByRole("combobox", { name: "Exchange" });
  await exchange.click();
  await exchange.fill("Swiss");
  await page.getByRole("option", { name: "SIX Swiss Exchange (XSWX)" }).click();
  await expect(page.getByLabel("Result Count")).toHaveText("24 listings");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByLabel("Result Count")).toHaveText("1 listing");
  await page
    .locator('[row-id] [col-id="name"]')
    .filter({ hasText: "E2E Example Security" })
    .click();
  const details = page.getByRole("region", { name: "Security Details" });
  await expect(details.getByLabel("Latest Closing Price")).toContainText("CHF");
  const selectedHistoryAttempts = await historyAttempts();
  await selectSegmentedControlOption(details, "5Y");
  expect(await historyAttempts()).toBe(selectedHistoryAttempts);
});

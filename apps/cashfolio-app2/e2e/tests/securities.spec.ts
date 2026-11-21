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
  await expect
    .poll(() =>
      prisma.valuationProviderRequest.count({
        where: {
          provider: "MARKETSTACK",
          requestReason: "SECURITY_METADATA",
          symbol: "E2E.PARTIAL",
          outcome: "HTTP_ERROR",
        },
      }),
    )
    .toBeGreaterThanOrEqual(3);
  await expect(details.getByLabel("ISIN", { exact: true })).toHaveText(
    "Unknown",
  );
  await expect(
    details.getByRole("button", { name: "Copy Symbol" }),
  ).toBeEnabled();
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
        requestReason: {
          in: ["SECURITY_SEARCH", "SECURITY_HISTORY", "SECURITY_METADATA"],
        },
      },
    });
  const historyAttempts = () =>
    prisma.valuationProviderRequest.count({
      where: { provider: "MARKETSTACK", requestReason: "SECURITY_HISTORY" },
    });
  const metadataAttempts = () =>
    prisma.valuationProviderRequest.count({
      where: { provider: "MARKETSTACK", requestReason: "SECURITY_METADATA" },
    });
  const metadataBefore = await metadataAttempts();
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
  expect(await metadataAttempts()).toBe(metadataBefore);
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
  const selectedMetadataBefore = await metadataAttempts();
  await page
    .locator('[row-id] [col-id="name"]')
    .filter({ hasText: "E2E Example Security" })
    .click();
  const details = page.getByRole("region", { name: "Security Details" });
  await expect(details.getByLabel("Latest Closing Price")).toContainText("CHF");
  await expect.poll(metadataAttempts).toBeGreaterThan(selectedMetadataBefore);
  const selectedMetadataAttempts = await metadataAttempts();
  const selectedHistoryAttempts = await historyAttempts();
  await selectSegmentedControlOption(details, "5Y");
  expect(await historyAttempts()).toBe(selectedHistoryAttempts);
  expect(await metadataAttempts()).toBe(selectedMetadataAttempts);
});

test("ISIN is verified for the selected exchange and metadata failure leaves price history usable", async ({
  page,
}) => {
  await page.goto(`/${accountBookId}/securities`);
  await page
    .getByRole("textbox", { name: "Security", exact: true })
    .fill("E2E.SEC");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByLabel("Result Count")).toHaveText("2 listings");
  const rows = page
    .locator('[row-id] [col-id="name"]')
    .filter({ hasText: "E2E Example Security" });
  await rows.nth(0).click();
  const details = page.getByRole("region", { name: "Security Details" });
  await expect(details.getByLabel("ISIN", { exact: true })).toHaveText(
    "US0000000000",
  );
  await expect(details.getByLabel("Latest Closing Price")).toContainText("USD");
  await details.getByRole("button", { name: "Close Details" }).click();
  const rejected = () =>
    prisma.valuationProviderRequest.count({
      where: {
        provider: "MARKETSTACK",
        requestReason: "SECURITY_METADATA",
        symbol: "E2E.SEC",
        outcome: "PROVIDER_ERROR",
      },
    });
  const before = await rejected();
  await rows.nth(1).click();
  await expect(details.getByLabel("Latest Closing Price")).toContainText("CHF");
  await expect.poll(rejected).toBeGreaterThan(before);
  await expect(details.getByLabel("ISIN", { exact: true })).toHaveText(
    "Unknown",
  );
  await expect(
    details.getByRole("button", { name: "Copy Symbol" }),
  ).toBeEnabled();
});

test("missing ISIN remains Unknown for a selected listing without price history", async ({
  page,
}) => {
  const requests = () =>
    prisma.valuationProviderRequest.count({
      where: {
        provider: "MARKETSTACK",
        requestReason: "SECURITY_METADATA",
        symbol: "E2E.ISIN.EMPTY",
      },
    });
  const before = await requests();
  await page.goto(`/${accountBookId}/securities`);
  await page
    .getByRole("textbox", { name: "Security", exact: true })
    .fill("E2E.ISIN.EMPTY");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .locator('[row-id] [col-id="name"]')
    .filter({ hasText: "E2E Missing ISIN" })
    .click();
  await expect.poll(requests).toBeGreaterThan(before);
  const details = page.getByRole("region", { name: "Security Details" });
  await expect(details.getByLabel("ISIN", { exact: true })).toHaveText(
    "Unknown",
  );
  await expect(
    details.getByLabel("Historical Prices", { exact: true }),
  ).toHaveText("Unavailable");
  await expect(
    details.getByRole("button", { name: "Copy Symbol" }),
  ).toBeEnabled();
});

import { createId } from "@paralleldrive/cuid2";
import { seedDatabase } from "../support/db";
import { prisma } from "../support/db-client";
import { expect, test } from "../support/fixtures";
import { selectSegmentedControlOption } from "../support/segmented-control";
let accountBookId: string;
test.beforeAll(async ({ e2eExternalId }) => {
  accountBookId = (await seedDatabase({ userExternalId: e2eExternalId }))
    .accountBookId;
});
test.beforeEach(async ({ e2eExternalId }) => {
  await prisma.user.update({
    where: { externalId: e2eExternalId },
    data: { securitiesExchangeMic: null },
  });
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

test("URL refresh restores query, exact selection, page and local chart range", async ({
  page,
}) => {
  await page.goto(
    `/${accountBookId}/securities?q=E2E.PAGE&page=2&selectedSymbol=E2E.SEC&selectedMic=XNAS&range=5Y`,
  );
  await expect(
    page.getByRole("button", { name: "Page 2", exact: true }),
  ).toHaveAttribute("data-active");
  await expect(
    page
      .locator('[row-id] [col-id="symbol"]')
      .filter({ hasText: "E2E.PAGE.21" }),
  ).toBeVisible();
  const details = page.getByRole("region", { name: "Security Details" });
  await expect(details.getByLabel("ISIN", { exact: true })).toHaveText(
    "US0000000000",
  );
  await expect(details.getByLabel("Latest Closing Price")).toContainText("USD");
  await expect(
    details.getByRole("radio", { name: "5Y", exact: true }),
  ).toBeChecked();
  await page.reload();
  await expect(details.getByLabel("Latest Closing Price")).toContainText("USD");
  await expect(
    details.getByRole("radio", { name: "5Y", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Page 2", exact: true }),
  ).toHaveAttribute("data-active");
  await details.getByRole("button", { name: "Close Details" }).click();
  await expect(page).not.toHaveURL(/selectedSymbol/);
  await page.goBack();
  await expect(details.getByLabel("ISIN", { exact: true })).toHaveText(
    "US0000000000",
  );
  await selectSegmentedControlOption(details, "1M");
  await expect(page).toHaveURL(/range=1M/);
  await page.goBack();
  await expect(
    details.getByRole("radio", { name: "5Y", exact: true }),
  ).toBeChecked();
  await page.goForward();
  await expect(
    details.getByRole("radio", { name: "1M", exact: true }),
  ).toBeChecked();
});

test("exchange choices persist on the user and submitted URLs override the saved default", async ({
  page,
  e2eExternalId,
}) => {
  const other = await prisma.user.create({
    data: {
      id: createId(),
      externalId: `securities-preference-${createId()}`,
      securitiesExchangeMic: "XNYS",
    },
  });
  const secondBook = await seedDatabase({ userExternalId: e2eExternalId });
  await page.goto(`/${accountBookId}/securities`);
  const exchange = page.getByRole("combobox", { name: "Exchange" });
  await exchange.click();
  await exchange.fill("Swiss");
  await page.getByRole("option", { name: "SIX Swiss Exchange (XSWX)" }).click();
  await expect
    .poll(
      async () =>
        (
          await prisma.user.findUniqueOrThrow({
            where: { externalId: e2eExternalId },
          })
        ).securitiesExchangeMic,
    )
    .toBe("XSWX");
  await expect(page.getByLabel("Submitted Search")).toHaveCount(0);
  await page.reload();
  await expect(exchange).toHaveValue("SIX Swiss Exchange (XSWX)");
  await page.goto(`/${secondBook.accountBookId}/securities`);
  await expect(exchange).toHaveValue("SIX Swiss Exchange (XSWX)");
  expect(
    (await prisma.user.findUniqueOrThrow({ where: { id: other.id } }))
      .securitiesExchangeMic,
  ).toBe("XNYS");
  await expect(page.getByLabel("Submitted Search")).toHaveCount(0);
  await page.goto(`/${accountBookId}/securities?q=E2E.SEC`);
  await expect(exchange).toHaveValue("");
  await expect(page.getByLabel("Result Count")).toHaveText("2 listings");
  expect(
    (
      await prisma.user.findUniqueOrThrow({
        where: { externalId: e2eExternalId },
      })
    ).securitiesExchangeMic,
  ).toBe("XSWX");
  await page.goto(`/${accountBookId}/securities`);
  await expect(exchange).toHaveValue("SIX Swiss Exchange (XSWX)");
  await page.getByRole("button", { name: "Clear Exchange" }).click();
  await expect
    .poll(
      async () =>
        (
          await prisma.user.findUniqueOrThrow({
            where: { externalId: e2eExternalId },
          })
        ).securitiesExchangeMic,
    )
    .toBeNull();
  await page.reload();
  await expect(exchange).toHaveValue("");
  await prisma.user.delete({ where: { id: other.id } });
});

test("a missing URL selection leaves browsable results and an actionable close", async ({
  page,
}) => {
  await page.goto(
    `/${accountBookId}/securities?q=E2E.SEC&selectedSymbol=E2E.MISSING&selectedMic=XNAS`,
  );
  await expect(
    page.getByText("Selection Unavailable", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Result Count")).toHaveText("2 listings");
  await page.getByRole("button", { name: "Back to Results" }).click();
  await expect(page).not.toHaveURL(/selectedSymbol/);
  await page
    .locator('[row-id] [col-id="name"]')
    .filter({ hasText: "E2E Example Security" })
    .first()
    .click();
  await expect(page.getByLabel("Latest Closing Price")).toContainText("USD");
});

test("a delayed security switch clears enrichment and keeps progress until both requests finish", async ({
  page,
}) => {
  await page.goto(`/${accountBookId}/securities?q=E2E.SEC`);
  const rows = page
    .locator('[row-id] [col-id="name"]')
    .filter({ hasText: "E2E Example Security" });
  await rows.nth(1).click();
  const details = page.getByRole("region", { name: "Security Details" });
  await expect(
    details.getByLabel("Quote Currency", { exact: true }),
  ).toHaveText("CHF");
  await expect(details.getByLabel("ISIN", { exact: true })).toHaveText(
    "Unknown",
  );
  let releaseHistory!: () => void;
  let releaseMetadata!: () => void;
  const historyGate = new Promise<void>((resolve) => {
    releaseHistory = resolve;
  });
  const metadataGate = new Promise<void>((resolve) => {
    releaseMetadata = resolve;
  });
  let waitingHistory = false;
  let waitingMetadata = false;
  await page.route("**/_serverFn/**", async (route) => {
    if (!route.request().url().includes("selectionToken"))
      return route.continue();
    const response = await route.fetch();
    if ((await response.text()).includes("listingId")) {
      waitingMetadata = true;
      await metadataGate;
    } else {
      waitingHistory = true;
      await historyGate;
    }
    await route.fulfill({ response });
  });
  try {
    await rows.nth(0).click();
    await expect.poll(() => waitingHistory && waitingMetadata).toBe(true);
    for (const label of ["ISIN", "Quote Currency", "Security Type"]) {
      await expect(details.getByLabel(label, { exact: true })).toHaveAttribute(
        "aria-busy",
        "true",
      );
      await expect(
        details.getByLabel(label, { exact: true }),
      ).not.toContainText(/CHF|Unknown/);
    }
    await expect(details.getByLabel("Loading Price History")).toBeVisible();
    await expect(page.getByTestId("global-loading-indicator")).toHaveAttribute(
      "data-mounted",
      "true",
    );
    releaseHistory();
    await expect(
      details.getByLabel("Quote Currency", { exact: true }),
    ).toHaveText("USD");
    await expect(details.getByLabel("ISIN", { exact: true })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(page.getByTestId("global-loading-indicator")).toHaveAttribute(
      "data-mounted",
      "true",
    );
    releaseMetadata();
    await expect(details.getByLabel("ISIN", { exact: true })).toHaveText(
      "US0000000000",
    );
    await expect(
      page.getByTestId("global-loading-indicator"),
    ).not.toHaveAttribute("data-mounted");
  } finally {
    releaseHistory();
    releaseMetadata();
    await page.unroute("**/_serverFn/**");
  }
});

test("a failed preference save stays nonblocking and retries explicitly", async ({
  page,
  e2eExternalId,
}) => {
  let writes = 0;
  await page.route("**/_serverFn/**", async (route) => {
    if (
      route.request().method() !== "POST" ||
      !route.request().postData()?.includes("exchange")
    )
      return route.continue();
    if (++writes === 1)
      return route.fulfill({
        status: 503,
        contentType: "text/plain",
        body: "Preference unavailable",
      });
    return route.continue();
  });
  await page.goto(`/${accountBookId}/securities`);
  const exchange = page.getByRole("combobox", { name: "Exchange" });
  await exchange.click();
  await exchange.fill("Swiss");
  await page.getByRole("option", { name: "SIX Swiss Exchange (XSWX)" }).click();
  await expect(
    page.getByText("Exchange Preference Not Saved", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Security", exact: true })
    .fill("E2E.SEC");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByLabel("Result Count")).toHaveText("1 listing");
  await page.getByRole("button", { name: "Retry Saving Preference" }).click();
  await expect
    .poll(
      async () =>
        (
          await prisma.user.findUniqueOrThrow({
            where: { externalId: e2eExternalId },
          })
        ).securitiesExchangeMic,
    )
    .toBe("XSWX");
  await expect(
    page.getByText("Exchange Preference Not Saved", { exact: true }),
  ).toHaveCount(0);
  expect(writes).toBe(2);
});

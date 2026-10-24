import {
  seedDatabase,
  seedTransactionsPageScenario,
  type SeededData,
} from "../support/db";
import {
  agGridCellByColId,
  agGridRowByText,
  clickGridRowSelectionCheckbox,
  clickRowAction,
} from "../support/grid";
import { expect, test, type Page } from "../support/fixtures";
import { createId } from "@paralleldrive/cuid2";

let seeded: SeededData;
let scenario: Awaited<ReturnType<typeof seedTransactionsPageScenario>>;

const detailsRegion = (page: Page) =>
  page.getByRole("region", { name: /^Transaction details:/ });

async function chooseTransactionMenuAction(
  page: Page,
  action: "Copy" | "Delete",
) {
  await detailsRegion(page)
    .getByRole("button", { name: "Transaction actions", exact: true })
    .click();
  await page
    .getByRole("menu")
    .getByRole("menuitem", { name: action, exact: true })
    .click();
}

async function openList(page: Page) {
  await page.goto(`/${seeded.accountBookId}/transactions?period=2026-05`);
  await expect(agGridRowByText(page, scenario.newerDescription)).toBeVisible();
}

test.beforeEach(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
  scenario = await seedTransactionsPageScenario({
    accountBookId: seeded.accountBookId,
    cashAccountId: seeded.cashAccount.id,
    savingsAccountId: seeded.savingsAccount.id,
    expenseAccountId: seeded.expenseAccount.id,
  });
});

test("inspects rows independently of bulk selection and preserves focus with a fixed-height panel", async ({
  page,
}, testInfo) => {
  await openList(page);
  const mainGrid = await page
    .getByRole("grid", { name: "Transactions", exact: true })
    .elementHandle();
  const newer = agGridRowByText(page, scenario.newerDescription);
  const older = agGridRowByText(page, scenario.olderDescription);
  const details = detailsRegion(page);
  await expect(details).toHaveCount(0);
  await expect(page.getByRole("button", { name: "View details" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("grid", { name: "Transactions", exact: true }),
  ).toHaveAccessibleDescription(
    "Press Enter on a transaction cell to view details. Press Space to select a transaction.",
  );
  await clickGridRowSelectionCheckbox(older);
  await expect(details).toHaveCount(0);
  await expect(
    page.getByText("1 transaction selected", { exact: false }),
  ).toBeVisible();
  await agGridCellByColId(newer, "description").click();
  await expect(agGridCellByColId(newer, "description")).toBeFocused();
  await expect(details).toContainText(scenario.newerDescription);
  await expect(details).toContainText("12.05.2026 · 2 bookings");
  await expect(newer).toHaveClass(/transaction-inspected/);
  await expect(details.getByRole("heading")).not.toBeFocused();
  await expect(
    page.getByRole("status", { name: "Transaction details announcement" }),
  ).toContainText(scenario.newerDescription);
  await expect(
    page.getByText("1 transaction selected", { exact: false }),
  ).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath("desktop-details.png"),
    fullPage: true,
  });
  await expect(
    page.getByRole("separator", { name: "Resize transaction details" }),
  ).toHaveCount(0);
  const panelHeight = (await details.boundingBox())!.height;
  const availableHeight = await details.evaluate(
    (panel) =>
      panel.parentElement!.parentElement!.getBoundingClientRect().height,
  );
  expect(panelHeight).toBeCloseTo(Math.min(320, availableHeight / 2), 0);

  await agGridCellByColId(older, "description").focus();
  await page.keyboard.press("Enter");
  await expect(details.getByRole("heading")).toBeFocused();
  await expect(details).toContainText(scenario.olderDescription);
  await expect(newer).not.toHaveClass(/transaction-inspected/);
  expect((await details.boundingBox())!.height).toBeCloseTo(panelHeight, 0);
  await details
    .getByRole("button", { name: "Close transaction details" })
    .click();
  await expect(details).toHaveCount(0);
  expect(await mainGrid!.evaluate((element) => element.isConnected)).toBe(true);
  await expect(
    page.getByText("1 transaction selected", { exact: false }),
  ).toBeVisible();
  await expect(agGridCellByColId(older, "description")).toBeFocused();
  await agGridCellByColId(older, "date").click();
  expect((await details.boundingBox())!.height).toBeCloseTo(panelHeight, 0);
  await details
    .getByRole("button", { name: "Close transaction details" })
    .click();
  await expect(agGridCellByColId(older, "date")).toBeFocused();
});

test("keeps inspection across mobile transitions and returns focus on Escape", async ({
  page,
}, testInfo) => {
  await openList(page);
  const mainGrid = await page
    .getByRole("grid", { name: "Transactions", exact: true })
    .elementHandle();
  const newer = agGridRowByText(page, scenario.newerDescription);
  await agGridCellByColId(newer, "date").focus();
  await page.keyboard.press("Enter");
  await page.setViewportSize({ width: 390, height: 844 });
  const drawer = page.getByRole("dialog", {
    name: "Transaction details",
    exact: true,
  });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText(scenario.newerDescription);
  await expect(
    drawer.getByRole("grid", { name: "Transaction bookings" }),
  ).toBeVisible();
  await expect(
    page.getByRole("separator", { name: "Resize transaction details" }),
  ).toHaveCount(0);
  await expect
    .poll(async () => Math.round((await drawer.boundingBox())!.y))
    .toBe(0);
  await page.screenshot({
    path: testInfo.outputPath("mobile-details.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(drawer).not.toBeVisible();
  await expect(detailsRegion(page)).toContainText(scenario.newerDescription);
  expect((await detailsRegion(page).boundingBox())!.height).toBeCloseTo(320, 0);
  expect(await mainGrid!.evaluate((element) => element.isConnected)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(drawer).toBeVisible();
  const mobileBooking = drawer
    .locator(".ag-grid-scrolling-container > .ag-row")
    .filter({ hasText: `${scenario.newerDescription} Cash` })
    .first();
  await clickRowAction(mobileBooking, "Rebook");
  const rebookDialog = page.getByRole("dialog", {
    name: "Rebook Booking",
    exact: true,
  });
  await expect(rebookDialog).toBeVisible();
  await rebookDialog
    .getByRole("button", { name: "Cancel", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(rebookDialog).not.toBeVisible();
  await expect(drawer).toBeVisible();
  await expect(
    mobileBooking.getByRole("button", { name: "Rebook", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(agGridCellByColId(newer, "date")).toBeFocused();
});

test("aligns a fixed-height panel with the grid edges and wraps long headings", async ({
  page,
}, testInfo) => {
  const { prisma } = await import("../support/db-client");
  const descriptions = [
    "Statement payment reference with additional beneficiary and remittance information ".repeat(
      3,
    ),
    "TransactionDescriptionWithoutSpaces".repeat(12),
  ];
  for (const [index, colorScheme] of (["light", "dark"] as const).entries()) {
    await prisma.transaction.update({
      where: {
        id_accountBookId: {
          id: scenario.newerTransactionId,
          accountBookId: seeded.accountBookId,
        },
      },
      data: { description: descriptions[index] },
    });
    await page.emulateMedia({ colorScheme });
    for (const viewport of [
      { width: 820, height: 900 },
      { width: 1280, height: 900 },
      { width: 1280, height: 500 },
      { width: 820, height: 500 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(
        `/${seeded.accountBookId}/transactions?period=2026-05&transactionId=${scenario.newerTransactionId}`,
      );
      const details = detailsRegion(page);
      const heading = details.getByRole("heading");
      const close = details.getByRole("button", {
        name: "Close transaction details",
      });
      await expect(heading).toBeFocused();
      const firstBooking = details
        .locator(".ag-grid-scrolling-container > .ag-row")
        .first();
      const bookingsViewport = (await details
        .locator(".ag-grid-viewport")
        .boundingBox())!;
      await expect(firstBooking).toBeVisible();
      const bookingBounds = (await firstBooking.boundingBox())!;
      expect(bookingsViewport.height).toBeGreaterThanOrEqual(
        bookingBounds.height,
      );
      expect(bookingBounds.y).toBeGreaterThanOrEqual(bookingsViewport.y);
      expect(bookingBounds.y + bookingBounds.height).toBeLessThanOrEqual(
        bookingsViewport.y + bookingsViewport.height,
      );
      await expect(
        page.getByRole("separator", { name: "Resize transaction details" }),
      ).toHaveCount(0);
      const panelBounds = (await details.boundingBox())!;
      const headingBounds = (await heading.boundingBox())!;
      const headingLineHeight = await heading.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).lineHeight),
      );
      expect(headingBounds.height).toBeLessThanOrEqual(
        headingLineHeight * (panelBounds.height <= 256 ? 1 : 2) + 1,
      );
      await expect(heading).toHaveAccessibleName(
        `Transaction details: ${descriptions[index]!.trim()}`,
      );
      await expect(heading).toHaveAttribute(
        "title",
        `Transaction details: ${descriptions[index]}`,
      );
      const closeBounds = (await close.boundingBox())!;
      const availableHeight = await details.evaluate(
        (panel) =>
          panel.parentElement!.parentElement!.getBoundingClientRect().height,
      );
      expect(panelBounds.height).toBeCloseTo(
        Math.min(320, availableHeight / 2),
        0,
      );
      const listBottom = await page
        .getByRole("grid", { name: "Transactions", exact: true })
        .evaluate(
          (grid) =>
            grid.closest(".ag-root-wrapper")!.getBoundingClientRect().bottom,
        );
      expect(panelBounds.y - listBottom).toBeCloseTo(10, 0);
      expect(headingBounds.y - panelBounds.y).toBeCloseTo(10, 0);
      expect(closeBounds.y).toBeCloseTo(headingBounds.y, 0);
      expect(headingBounds.x + headingBounds.width).toBeLessThanOrEqual(
        closeBounds.x - 9,
      );
      const metadata = (await details
        .getByText("12.05.2026 · 2 bookings", { exact: true })
        .boundingBox())!;
      expect(metadata.y - headingBounds.y - headingBounds.height).toBeCloseTo(
        2,
        0,
      );
      const bookingsBounds = await page
        .getByRole("grid", { name: "Transaction bookings", exact: true })
        .evaluate((grid) =>
          grid.closest(".ag-root-wrapper")!.getBoundingClientRect().toJSON(),
        );
      expect(bookingsBounds.y - metadata.y - metadata.height).toBeCloseTo(
        10,
        0,
      );
      expect(headingBounds.x).toBeCloseTo(bookingsBounds.x, 0);
      expect(closeBounds.x + closeBounds.width).toBeCloseTo(
        bookingsBounds.x + bookingsBounds.width,
        0,
      );
      expect(bookingsBounds.y + bookingsBounds.height).toBeCloseTo(
        panelBounds.y + panelBounds.height,
        0,
      );
      await page.screenshot({
        path: testInfo.outputPath(
          `fixed-panel-${colorScheme}-${viewport.width}-${viewport.height}.png`,
        ),
        fullPage: true,
      });
      await clickRowAction(firstBooking, "Rebook");
      const rebook = page.getByRole("dialog", {
        name: "Rebook Booking",
        exact: true,
      });
      await expect(rebook).toBeVisible();
      await rebook.getByRole("button", { name: "Cancel", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(rebook).not.toBeVisible();
      await close.click();
      await expect(details).toHaveCount(0);
      await expect(
        agGridCellByColId(agGridRowByText(page, descriptions[index]!), "date"),
      ).toBeFocused();
    }
  }
});

test("reserves Enter for ordinary cells and preserves shortcuts, selection, actions and links", async ({
  page,
}) => {
  await openList(page);
  const newer = agGridRowByText(page, scenario.newerDescription);
  const date = agGridCellByColId(newer, "date");
  const details = detailsRegion(page);
  await date.focus();
  for (const key of [
    "Control+Enter",
    "Meta+Enter",
    "Alt+Enter",
    "Shift+Enter",
  ]) {
    await date.press(key);
    await expect(details).toHaveCount(0);
  }
  await date.press("Space");
  await expect(
    page.getByText("1 transaction selected", { exact: false }),
  ).toBeVisible();
  await expect(details).toHaveCount(0);
  const checkbox = newer.getByRole("checkbox");
  await checkbox.press("Space");
  await expect(
    page.getByRole("toolbar", { name: "Selected Row Actions" }),
  ).toHaveCount(0);
  await checkbox.press("Enter");
  await expect(details).toHaveCount(0);

  await date.focus();
  await date.press("Enter");
  const editButton = details.getByRole("button", { name: "Edit", exact: true });
  await editButton.focus();
  await editButton.press("Enter");
  const editor = page.getByRole("dialog", {
    name: "Edit Transaction",
    exact: true,
  });
  await expect(editor).toBeVisible();
  await expect(details).toBeVisible();
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(editButton).toBeFocused();

  const accountLink = agGridCellByColId(newer, "debitAccounts").getByRole(
    "link",
    { name: seeded.cashAccount.name, exact: true },
  );
  await accountLink.focus();
  await accountLink.press("Enter");
  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/${seeded.cashAccount.id}`),
  );
  await expect(details).toHaveCount(0);
});

test("offers panel actions on desktop and mobile, restores dialog focus, and opens a successful copy", async ({
  page,
}, testInfo) => {
  const { prisma } = await import("../support/db-client");
  await prisma.booking.updateMany({
    where: {
      transactionId: scenario.newerTransactionId,
      accountId: seeded.expenseAccount.id,
    },
    data: { accountId: seeded.savingsAccount.id },
  });
  for (const width of [1470, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await openList(page);
    await agGridCellByColId(
      agGridRowByText(page, scenario.newerDescription),
      "date",
    ).click();
    const details = detailsRegion(page);
    const menuTrigger = details.getByRole("button", {
      name: "Transaction actions",
      exact: true,
    });
    await expect(
      details.getByRole("button", { name: "Edit", exact: true }),
    ).toHaveAttribute("data-variant", "default");
    await expect(menuTrigger).toHaveAttribute("data-variant", "default");
    const editButton = details.getByRole("button", {
      name: "Edit",
      exact: true,
    });
    const closeButton = details.getByRole("button", {
      name: "Close transaction details",
      exact: true,
    });
    await expect(closeButton).toHaveText("Close");
    await expect(closeButton).toHaveAttribute("data-variant", "subtle");
    expect((await closeButton.boundingBox())!.height).toBeCloseTo(36, 0);
    expect((await closeButton.boundingBox())!.height).toBeCloseTo(
      (await editButton.boundingBox())!.height,
      0,
    );
    await expect(closeButton).toHaveCSS(
      "font-size",
      await editButton.evaluate((button) => getComputedStyle(button).fontSize),
    );
    if (width === 1470)
      expect((await closeButton.boundingBox())!.y).toBeCloseTo(
        (await editButton.boundingBox())!.y,
        0,
      );
    await expect(
      details.getByRole("button", { name: /^(Copy|Delete)$/ }),
    ).toHaveCount(0);
    for (const [action, title] of [
      ["Edit", "Edit Transaction"],
      ["Copy", "Copy Transaction"],
      ["Delete", "Delete Transaction"],
    ] as const) {
      const button =
        action === "Edit"
          ? details.getByRole("button", { name: action, exact: true })
          : menuTrigger;
      await button.focus();
      await button.press("Enter");
      if (action !== "Edit") {
        const menu = page.getByRole("menu");
        await expect(menu).toBeVisible();
        await expect(menu.locator(".mantine-Menu-divider")).toHaveCount(1);
        expect(
          await menu.evaluate((element) =>
            Array.from(
              element.querySelectorAll(
                '[role="menuitem"], .mantine-Menu-divider',
              ),
            ).map((item) =>
              item.classList.contains("mantine-Menu-divider")
                ? "divider"
                : item.textContent?.trim(),
            ),
          ),
        ).toEqual(["Copy", "divider", "Delete"]);
        const item = menu.getByRole("menuitem", { name: action, exact: true });
        await item.focus();
        await item.press("Enter");
      }
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await expect(button).toBeFocused();
    }
    await menuTrigger.press("Enter");
    const menu = page.getByRole("menu");
    const copyItem = menu.getByRole("menuitem", { name: "Copy", exact: true });
    await copyItem.focus();
    await expect(menu).toHaveCSS("opacity", "1");
    await page.screenshot({
      path: testInfo.outputPath(`transaction-actions-${width}.png`),
      fullPage: true,
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      "dark",
    );
    await page.screenshot({
      path: testInfo.outputPath(`transaction-actions-dark-${width}.png`),
      fullPage: true,
    });
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      "light",
    );
    await copyItem.press("ArrowDown");
    await expect(
      menu.getByRole("menuitem", { name: "Delete", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(copyItem).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    await expect(menuTrigger).toBeFocused();
    await expect(details).toBeVisible();
    await closeButton.focus();
    await closeButton.press("Enter");
    await expect(details).toHaveCount(0);
    const originatingCell = agGridCellByColId(
      agGridRowByText(page, scenario.newerDescription),
      "date",
    );
    await expect(originatingCell).toBeFocused();
    await originatingCell.click();
    await expect(details).toBeVisible();
    if (width === 390) {
      const editBounds = (await details
        .getByRole("button", { name: "Edit", exact: true })
        .boundingBox())!;
      const headingBounds = (await details.getByRole("heading").boundingBox())!;
      expect(editBounds.y).toBeGreaterThan(
        headingBounds.y + headingBounds.height,
      );
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "Transaction details", exact: true }),
      ).not.toBeVisible();
      await agGridCellByColId(
        agGridRowByText(page, scenario.newerDescription),
        "date",
      ).click();
    }
  }
  await chooseTransactionMenuAction(page, "Copy");
  const copy = page.getByRole("dialog", {
    name: "Copy Transaction",
    exact: true,
  });
  await copy.getByLabel("Description").fill("Copied from transaction details");
  await copy.getByRole("button", { name: "Create Copy", exact: true }).click();
  await expect(copy).not.toBeVisible();
  await expect(detailsRegion(page)).toContainText(
    "Copied from transaction details",
  );
});

test("fits both grids at 1470px with vertical scrolling and preserves resizing", async ({
  page,
}, testInfo) => {
  const { prisma } = await import("../support/db-client");
  for (let index = 0; index < 8; index++) {
    await seedTransactionsPageScenario({
      accountBookId: seeded.accountBookId,
      cashAccountId: seeded.cashAccount.id,
      savingsAccountId: seeded.savingsAccount.id,
      expenseAccountId: seeded.expenseAccount.id,
    });
  }
  await prisma.account.update({
    where: {
      id_accountBookId: {
        id: seeded.cashAccount.id,
        accountBookId: seeded.accountBookId,
      },
    },
    data: {
      name: "Everyday account CHF with a long account name for layout verification",
    },
  });
  await prisma.transaction.update({
    where: {
      id_accountBookId: {
        id: scenario.newerTransactionId,
        accountBookId: seeded.accountBookId,
      },
    },
    data: {
      description:
        "Partial Ethereum sale with proceeds transferred to the everyday account",
    },
  });
  await prisma.booking.createMany({
    data: Array.from({ length: 20 }, (_, index) => ({
      id: createId(),
      accountBookId: seeded.accountBookId,
      transactionId: scenario.newerTransactionId,
      accountId:
        index % 2 === 0 ? seeded.cashAccount.id : seeded.savingsAccount.id,
      date: new Date("2026-05-12T00:00:00Z"),
      description: `Additional booking ${index}`,
      unit: "CURRENCY" as const,
      currency: "CHF",
      value: index % 2 === 0 ? 12345.67 : -12345.67,
      sortOrder: index + 2,
    })),
  });
  await page.setViewportSize({ width: 1470, height: 900 });
  await page.goto(
    `/${seeded.accountBookId}/transactions?period=2026-05&transactionId=${scenario.newerTransactionId}`,
  );
  const main = page.getByRole("grid", { name: "Transactions", exact: true });
  const bookings = page.getByRole("grid", {
    name: "Transaction bookings",
    exact: true,
  });
  await expect(bookings).toBeVisible();
  await expect(main.locator('[col-id="actions"]')).toHaveCount(0);
  await expect(
    main.getByRole("button", { name: /^(Edit|Copy|Delete)$/ }),
  ).toHaveCount(0);
  async function expectFit(grid: typeof main, lastColumn: string) {
    await expect(async () => {
      const metrics = await grid.evaluate((element, column) => {
        const root = element.closest(".ag-root-wrapper")!;
        const viewport = root.querySelector<HTMLElement>(".ag-grid-viewport")!;
        const last = root.querySelector<HTMLElement>(
          `.ag-header-cell[col-id="${column}"]`,
        )!;
        return {
          width: viewport.clientWidth,
          scrollWidth: viewport.scrollWidth,
          height: viewport.clientHeight,
          scrollHeight: viewport.scrollHeight,
          right:
            viewport.getBoundingClientRect().left +
            viewport.clientLeft +
            viewport.clientWidth,
          lastRight: last.getBoundingClientRect().right,
        };
      }, lastColumn);
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 1);
      expect(metrics.lastRight).toBeLessThanOrEqual(metrics.right + 1);
      expect(metrics.scrollHeight).toBeGreaterThan(metrics.height);
    }).toPass();
  }
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expectFit(main, "referenceAmount");
    await expectFit(bookings, "actions");
    await page.screenshot({
      path: testInfo.outputPath(`fit-1470-${colorScheme}.png`),
      fullPage: true,
    });
  }
  await main
    .getByRole("link", {
      name: "Everyday account CHF with a long account name for layout verification",
      exact: true,
    })
    .first()
    .hover();
  await expect(page.getByRole("tooltip")).toContainText(
    "Everyday account CHF with a long account name for layout verification",
  );
  await page.mouse.move(0, 0);
  await expect(page.getByRole("tooltip")).not.toBeVisible();
  await page.getByRole("button", { name: "Collapse Sidebar" }).click();
  await expectFit(main, "referenceAmount");
  await expectFit(bookings, "actions");
  await page.getByRole("button", { name: "Expand Sidebar" }).click();
  await expectFit(main, "referenceAmount");
  await expectFit(bookings, "actions");
  const description = bookings.getByRole("columnheader", {
    name: "Description",
    exact: true,
  });
  const resize = (await description
    .locator(".ag-header-cell-resize")
    .boundingBox())!;
  await page.mouse.move(
    resize.x + resize.width / 2,
    resize.y + resize.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(resize.x + 650, resize.y + resize.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  const resizedWidth = (await description.boundingBox())!.width;
  await detailsRegion(page)
    .getByRole("button", { name: "Close transaction details" })
    .click();
  await agGridCellByColId(
    main.locator(`.ag-row[row-id="${scenario.newerTransactionId}"]`).first(),
    "date",
  ).click();
  await expect
    .poll(async () => (await description.boundingBox())!.width)
    .toBe(resizedWidth);
  expect(resizedWidth).toBeGreaterThan(500);
  await page.setViewportSize({ width: 820, height: 900 });
  await expect
    .poll(() =>
      bookings.evaluate((grid) => {
        const viewport = grid
          .closest(".ag-root-wrapper")!
          .querySelector<HTMLElement>(".ag-grid-viewport")!;
        return viewport.scrollWidth - viewport.clientWidth;
      }),
    )
    .toBeGreaterThan(0);
});

test("opens navigation and mutation targets, refreshes bookings, and closes after deletion", async ({
  page,
}) => {
  // The display fixture includes an expense credit. Use an asset counter-booking
  // here so the existing editor's expense-direction validation permits saving.
  const { prisma } = await import("../support/db-client");
  await prisma.booking.updateMany({
    where: {
      transactionId: scenario.newerTransactionId,
      accountId: seeded.expenseAccount.id,
    },
    data: { accountId: seeded.cashAccount.id },
  });
  await page.goto(
    `/${seeded.accountBookId}/transactions?period=2026-05&transactionId=${scenario.newerTransactionId}`,
  );
  const details = detailsRegion(page);
  await expect(details).toContainText(scenario.newerDescription);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("transactionId"))
    .toBeNull();
  await details
    .getByRole("button", { name: "Close transaction details" })
    .click();
  const mainRow = agGridRowByText(page, scenario.newerDescription);
  await expect(agGridCellByColId(mainRow, "date")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(details.getByRole("heading")).toBeFocused();
  const booking = agGridRowByText(page, `${scenario.newerDescription} Cash`);
  await clickRowAction(booking, "Rebook");
  const rebook = page.getByRole("dialog", {
    name: "Rebook Booking",
    exact: true,
  });
  await expect(rebook).toBeVisible();
  await rebook.getByLabel("Target Account").click();
  await page.keyboard.type(seeded.savingsAccount.name);
  await page
    .getByRole("option", { name: new RegExp(seeded.savingsAccount.name) })
    .last()
    .click();
  await rebook.getByRole("button", { name: "Rebook", exact: true }).click();
  await expect(rebook).not.toBeVisible();
  await expect(
    agGridCellByColId(
      agGridRowByText(page, `${scenario.newerDescription} Cash`),
      "account",
    ),
  ).toContainText(seeded.savingsAccount.name);

  await details.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.getByRole("dialog", {
    name: "Edit Transaction",
    exact: true,
  });
  await edit.getByLabel("Description").fill("Updated transaction details");
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect(details).toContainText("Updated transaction details");
  await chooseTransactionMenuAction(page, "Delete");
  const deletion = page.getByRole("dialog", {
    name: "Delete Transaction",
    exact: true,
  });
  await deletion.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(deletion).not.toBeVisible();
  await expect(details).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .getByRole("grid", { name: "Transactions", exact: true })
        .evaluate((grid) => grid.contains(document.activeElement)),
    )
    .toBe(true);
});

test("returns focus to the main grid when the last inspected transaction is deleted", async ({
  page,
}) => {
  await openList(page);
  await agGridCellByColId(
    agGridRowByText(page, scenario.olderDescription),
    "date",
  ).click();
  await chooseTransactionMenuAction(page, "Delete");
  const dialog = page.getByRole("dialog", {
    name: "Delete Transaction",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(agGridRowByText(page, scenario.olderDescription)).toHaveCount(0);
  const newer = agGridRowByText(page, scenario.newerDescription);
  await agGridCellByColId(newer, "date").focus();
  await page.keyboard.press("Enter");
  await expect(detailsRegion(page)).toBeVisible();
  await chooseTransactionMenuAction(page, "Delete");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(detailsRegion(page)).toHaveCount(0);
  // AG Grid retains focus in its column headers when the final row disappears.
  // Headers are siblings of the viewport that exposes role="grid".
  await expect
    .poll(() =>
      page
        .getByRole("grid", { name: "Transactions", exact: true })
        .evaluate((grid) =>
          grid.closest(".ag-root-wrapper")?.contains(document.activeElement),
        ),
    )
    .toBe(true);
});

test("closes details on a period change", async ({ page }) => {
  await openList(page);
  await agGridCellByColId(
    agGridRowByText(page, scenario.newerDescription),
    "date",
  ).click();
  await expect(detailsRegion(page)).toBeVisible();
  await page.getByRole("button", { name: "Next Period" }).click();
  await expect(detailsRegion(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Previous Period" }).click();
  await expect(agGridRowByText(page, scenario.newerDescription)).toBeVisible();
  await expect(detailsRegion(page)).toHaveCount(0);
});

test("resets booking filters and scrolling between transactions, retains column widths, and closes when filtered out", async ({
  page,
}) => {
  await openList(page);
  const newer = agGridRowByText(page, scenario.newerDescription);
  const older = agGridRowByText(page, scenario.olderDescription);
  await agGridCellByColId(newer, "date").click();
  const bookings = page.getByRole("grid", {
    name: "Transaction bookings",
    exact: true,
  });
  const description = bookings.getByRole("columnheader", {
    name: "Description",
    exact: true,
  });
  const before = await description.boundingBox();
  expect(before).not.toBeNull();
  const handle = description.locator(".ag-header-cell-resize");
  const bounds = await handle.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds!.x + bounds!.width / 2 + 60,
    bounds!.y + bounds!.height / 2,
  );
  await page.mouse.up();
  const resized = await description.boundingBox();
  expect(resized!.width).toBeGreaterThan(before!.width);

  await description.focus();
  await description.press("Control+Enter");
  await page
    .getByRole("textbox", { name: "Filter Value", exact: true })
    .first()
    .fill("Cash");
  await page.keyboard.press("Escape");
  await expect(
    bookings.locator(".ag-grid-scrolling-container > .ag-row"),
  ).toHaveCount(1);
  const viewport = detailsRegion(page).locator(".ag-grid-viewport");
  await viewport.evaluate((element) => {
    element.scrollLeft = 400;
  });
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await agGridCellByColId(older, "date").click();
  await expect(
    bookings.locator(".ag-grid-scrolling-container > .ag-row"),
  ).toHaveCount(2);
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollLeft))
    .toBe(0);
  await expect
    .poll(async () => (await description.boundingBox())!.width)
    .toBe(resized!.width);
  await expect(
    bookings.getByText(`${scenario.olderDescription} Cash`, { exact: true }),
  ).toBeVisible();
  await detailsRegion(page)
    .getByRole("button", { name: "Close transaction details" })
    .click();
  await agGridCellByColId(older, "date").click();
  await expect
    .poll(async () => (await description.boundingBox())!.width)
    .toBe(resized!.width);

  const mainDescription = page
    .getByRole("grid", { name: "Transactions", exact: true })
    .getByRole("columnheader", { name: "Description", exact: true });
  await mainDescription.focus();
  await mainDescription.press("Control+Enter");
  await page
    .getByRole("textbox", { name: "Filter Value", exact: true })
    .first()
    .fill("Newer");
  await expect(detailsRegion(page)).toHaveCount(0);
  await expect(newer).toBeVisible();
  await expect(older).toHaveCount(0);
  const filterInput = page
    .getByRole("textbox", { name: "Filter Value", exact: true })
    .first();
  await filterInput.press("Escape");
  await expect(filterInput).not.toBeVisible();
  await expect
    .poll(() =>
      page
        .getByRole("grid", { name: "Transactions", exact: true })
        .evaluate((grid) =>
          grid.closest(".ag-root-wrapper")?.contains(document.activeElement),
        ),
    )
    .toBe(true);
});

test("allows inspecting opening balances while preserving mutation restrictions", async ({
  page,
}) => {
  const { prisma } = await import("../support/db-client");
  const { AccountType, EquityAccountSubtype } =
    await import("../../src/.prisma-client/enums");
  const opening = await prisma.account.create({
    data: {
      name: "Opening Balances",
      accountBookId: seeded.accountBookId,
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
    },
  });
  await prisma.booking.updateMany({
    where: {
      transactionId: scenario.newerTransactionId,
      accountId: seeded.expenseAccount.id,
    },
    data: { accountId: opening.id },
  });
  await openList(page);
  const newer = agGridRowByText(page, scenario.newerDescription);
  await agGridCellByColId(newer, "date").focus();
  await page.keyboard.press("Enter");
  await expect(detailsRegion(page)).toBeVisible();
  await expect(
    detailsRegion(page).getByRole("button", { name: "Edit", exact: true }),
  ).toBeDisabled();
  const menuTrigger = detailsRegion(page).getByRole("button", {
    name: "Transaction actions",
    exact: true,
  });
  await expect(menuTrigger).toBeEnabled();
  await menuTrigger.click();
  const menu = page.getByRole("menu");
  for (const name of ["Copy", "Delete"]) {
    await expect(
      menu.getByRole("menuitem", { name, exact: true }),
    ).toBeDisabled();
  }
  await menu
    .getByRole("menuitem", { name: "Copy", exact: true })
    .locator("..")
    .hover();
  await expect(page.getByRole("tooltip").first()).toContainText(
    "Opening balance transactions can only be managed from account settings.",
  );
  await page.keyboard.press("Escape");
  await expect(
    detailsRegion(page).getByRole("button", { name: "Rebook", exact: true }),
  ).toHaveCount(2);
  for (const button of await detailsRegion(page)
    .getByRole("button", { name: "Rebook", exact: true })
    .all()) {
    await expect(button).toBeDisabled();
  }
});

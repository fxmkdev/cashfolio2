import { Buffer } from "node:buffer";
import { expect, test, type Page } from "../support/fixtures";
import { seedDatabase, type SeededData } from "../support/db";
import {
  agGridRowByText,
  clickGridRowSelectionCheckbox,
  clickPinnedRowAction,
  setGridCellValue,
  setGridAccountTreeCellValue,
} from "../support/grid";

let seeded: SeededData;
let otherBook: SeededData;
const description = "Statement navigation guard";
const changedDescription = "Modified statement review";

test.beforeAll(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
  otherBook = await seedDatabase({ userExternalId: e2eExternalId });
});

function discardDialog(page: Page) {
  return page.getByRole("dialog", { name: "Discard reviewed statement?" });
}

async function upload(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: "navigation.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `Date;Amount;Original;Currency;Rate;Description\n2026-05-14;-42.55;;;;${description}`,
    ),
  });
  await expect(agGridRowByText(page, description)).toBeVisible();
}

async function openReview(page: Page) {
  await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);
  await page.getByRole("button", { name: "Account actions" }).click();
  await page.getByRole("menuitem", { name: "Import Statement" }).click();
  await upload(page);
}

async function modifyReview(page: Page) {
  await setGridCellValue(page, 0, "description", changedDescription);
  await expect(agGridRowByText(page, changedDescription)).toBeVisible();
}

async function requestNativeDeparture(
  page: Page,
  action: "reload" | "document" | "close",
) {
  // Repeated programmatic unloads need a fresh trusted user gesture in Chromium.
  // Shift does not change the focused editor or commit its pending input.
  await page.keyboard.press("Shift");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    )
    .toBe(true);
  const dialogPromise = page.waitForEvent("dialog");
  // A native dialog can pause the evaluating command. Resolve the dialog
  // before waiting for that command to finish.
  const departure =
    action === "close"
      ? page.close({ runBeforeUnload: true })
      : page.evaluate((action) => {
          if (action === "reload") window.location.reload();
          else window.location.assign("about:blank");
        }, action);
  void departure.catch(() => {});
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe("beforeunload");
  return {
    dismiss: async () => {
      await dialog.dismiss();
      await departure;
    },
    accept: async () => {
      await dialog.accept();
      await departure.catch((error: Error) => {
        expect(error.message).toMatch(
          /Execution context was destroyed|Target page, context or browser has been closed/,
        );
      });
    },
  };
}

test("untouched and reverted reviews return to Upload and leave without confirmation", async ({
  page,
}) => {
  await openReview(page);
  await page.getByRole("button", { name: /Upload/ }).click();
  await expect(page.getByText("Drop CSV File Here")).toBeVisible();
  await expect(discardDialog(page)).toHaveCount(0);
  await upload(page);
  const row = agGridRowByText(page, description);
  await clickGridRowSelectionCheckbox(row);
  await clickGridRowSelectionCheckbox(row);
  await modifyReview(page);
  await setGridCellValue(page, 0, "description", description);
  await page
    .getByRole("link", { name: seeded.cashAccount.name, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/${seeded.cashAccount.id}$`));
  await expect(discardDialog(page)).toHaveCount(0);
});

for (const destination of [
  "breadcrumb",
  "sidebar",
  "account book",
  "Back",
  "Forward",
] as const) {
  test(`modified review confirms ${destination} navigation and preserves changes on cancellation`, async ({
    page,
  }) => {
    await openReview(page);
    if (destination === "Forward") {
      await page.getByRole("link", { name: "Accounts", exact: true }).click();
      await expect(page).toHaveURL(
        new RegExp(`/${seeded.accountBookId}/accounts(?:[?]|$)`),
      );
      await expect(
        page.getByRole("heading", { name: "Accounts", exact: true }),
      ).toBeVisible();
      await page.goBack();
      await upload(page);
    }
    await modifyReview(page);
    const reviewUrl = page.url();
    async function leave() {
      if (destination === "breadcrumb") {
        await page
          .getByRole("link", { name: seeded.cashAccount.name, exact: true })
          .click();
      } else if (destination === "sidebar") {
        await page.getByRole("link", { name: "Accounts", exact: true }).click();
      } else if (destination === "account book") {
        await page
          .getByRole("button", { name: "E2E Account Book", exact: true })
          .click();
        await page
          .locator(`[role="menuitem"][href^="/${otherBook.accountBookId}"]`)
          .click();
      } else {
        // History blockers resolve asynchronously; wait for their UI rather
        // than waiting for a navigation that is intentionally paused.
        await page.evaluate((direction) => {
          if (direction === "Back") window.history.back();
          else window.history.forward();
        }, destination);
      }
    }
    await leave();
    await expect(discardDialog(page)).toBeVisible();
    await discardDialog(page)
      .getByRole("button", { name: "Keep reviewing" })
      .click();
    await expect(discardDialog(page)).toHaveCount(0);
    await expect(page).toHaveURL(reviewUrl);
    await expect(agGridRowByText(page, changedDescription)).toBeVisible();
    await leave();
    await discardDialog(page)
      .getByRole("button", { name: "Discard and leave" })
      .click();
    const targetBook =
      destination === "account book"
        ? otherBook.accountBookId
        : seeded.accountBookId;
    const target =
      destination === "breadcrumb" || destination === "Back"
        ? seeded.cashAccount.id
        : "accounts";
    await expect(page).toHaveURL(
      new RegExp(`/${targetBook}/${target}(?:[?]|$)`),
    );
    await expect(discardDialog(page)).toHaveCount(0);
  });
}

test("dismissal cancels Upload and route confirmation without clearing the review", async ({
  page,
}) => {
  await openReview(page);
  await modifyReview(page);
  await page.getByRole("button", { name: /Upload/ }).click();
  await expect(discardDialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(discardDialog(page)).toHaveCount(0);
  await expect(agGridRowByText(page, changedDescription)).toBeVisible();
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  await expect(discardDialog(page)).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(discardDialog(page)).toHaveCount(0);
  await expect(agGridRowByText(page, changedDescription)).toBeVisible();
});

for (const action of ["reload", "document", "close"] as const) {
  test(`modified review uses native confirmation for ${action}`, async ({
    page,
  }) => {
    await openReview(page);
    await modifyReview(page);
    const reviewUrl = page.url();
    await (await requestNativeDeparture(page, action)).dismiss();
    await expect(page).toHaveURL(reviewUrl);
    await expect(agGridRowByText(page, changedDescription)).toBeVisible();
    const dialog = await requestNativeDeparture(page, action);
    if (action === "close") {
      const closed = page.waitForEvent("close");
      await dialog.accept();
      await closed;
    } else {
      await dialog.accept();
      if (action === "reload")
        await expect(page.getByText("Drop CSV File Here")).toBeVisible();
      else await expect(page).toHaveURL("about:blank");
    }
  });
}

test("pending inline input is protected before commit and Escape restores a clean review", async ({
  page,
}) => {
  await openReview(page);
  await page
    .locator('.ag-row[row-index="0"] [col-id="description"]')
    .first()
    .click();
  const input = page.locator(".ag-cell-inline-editing input");
  await input.fill("Pending inline description");
  await (await requestNativeDeparture(page, "reload")).dismiss();
  await expect(input).toHaveValue("Pending inline description");
  await input.press("Escape");
  await page.getByRole("button", { name: /Upload/ }).click();
  await expect(page.getByText("Drop CSV File Here")).toBeVisible();
  await expect(discardDialog(page)).toHaveCount(0);
});

test("unsaved modal input is protected, and Cancel discards only editor changes", async ({
  page,
}) => {
  await openReview(page);
  await clickPinnedRowAction({
    row: agGridRowByText(page, description),
    actionLabel: "Edit Imported Transaction",
  });
  const editor = page.getByRole("dialog", {
    name: "Edit Imported Transaction",
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    )
    .toBe(false);
  await editor
    .getByLabel("Description", { exact: true })
    .fill("Pending editor description");
  await (await requestNativeDeparture(page, "reload")).dismiss();
  await expect(editor.getByLabel("Description", { exact: true })).toHaveValue(
    "Pending editor description",
  );
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(agGridRowByText(page, description)).toBeVisible();
  await page.getByRole("button", { name: /Upload/ }).click();
  await expect(page.getByText("Drop CSV File Here")).toBeVisible();
});

test("reverting editor fields removes protection and subsequent booking additions restore it", async ({
  page,
}) => {
  await openReview(page);
  await clickPinnedRowAction({
    row: agGridRowByText(page, description),
    actionLabel: "Edit Imported Transaction",
  });
  const editor = page.getByRole("dialog", {
    name: "Edit Imported Transaction",
  });
  await editor.getByLabel("Description", { exact: true }).fill("Changed");
  await editor.getByLabel("Description", { exact: true }).fill(description);
  await editor.getByLabel("Date", { exact: true }).fill("05/15/2026");
  await editor.getByLabel("Date", { exact: true }).press("Tab");
  await editor.getByLabel("Description", { exact: true }).click();
  await editor.getByLabel("Date", { exact: true }).fill("05/14/2026");
  await editor.getByLabel("Date", { exact: true }).press("Tab");
  await editor.getByLabel("Description", { exact: true }).click();
  await expect(editor.getByLabel("Date", { exact: true })).toHaveValue(
    "05/14/2026",
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    )
    .toBe(false);
  await editor.getByRole("button", { name: "Add Booking" }).click();
  await (await requestNativeDeparture(page, "reload")).dismiss();
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: /Upload/ }).click();
  await expect(page.getByText("Drop CSV File Here")).toBeVisible();
});

test("modal booking input and invalid date input are protected before Save Draft", async ({
  page,
}) => {
  await openReview(page);
  await clickPinnedRowAction({
    row: agGridRowByText(page, description),
    actionLabel: "Edit Imported Transaction",
  });
  const editor = page.getByRole("dialog", {
    name: "Edit Imported Transaction",
  });
  await editor
    .locator('.ag-row[row-index="1"] [col-id="debit"]')
    .first()
    .click();
  const input = editor.locator(".ag-cell-inline-editing input");
  await input.fill("55");
  await (await requestNativeDeparture(page, "reload")).dismiss();
  await input.fill("42.55");
  await input.press("Enter");
  await editor.getByLabel("Date", { exact: true }).fill("invalid date");
  await (await requestNativeDeparture(page, "reload")).dismiss();
  await expect(editor.getByLabel("Date", { exact: true })).toHaveValue(
    "invalid date",
  );
});

test("failed import and an import in flight remain protected", async ({
  page,
}) => {
  await openReview(page);
  await setGridAccountTreeCellValue({
    root: page,
    rowIndex: 0,
    colId: "counterAccountId",
    accountName: seeded.expenseAccount.name,
  });
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/*", async (route) => {
    if (route.request().method() === "POST") {
      await pending;
      await route.abort("failed");
    } else await route.continue();
  });
  const request = page.waitForRequest((request) => request.method() === "POST");
  await page.getByRole("button", { name: "Import Transactions" }).click();
  await request;
  await (await requestNativeDeparture(page, "reload")).dismiss();
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  await expect(discardDialog(page)).toBeVisible();
  await discardDialog(page)
    .getByRole("button", { name: "Keep reviewing" })
    .click();
  release();
  await expect(
    page.getByRole("button", { name: "Import Transactions" }),
  ).toBeEnabled();
  await (await requestNativeDeparture(page, "reload")).dismiss();
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  await expect(discardDialog(page)).toBeVisible();
});

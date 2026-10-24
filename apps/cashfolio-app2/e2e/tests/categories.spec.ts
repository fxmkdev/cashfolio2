import { seedDatabase, type SeededData } from "../support/db";
import { agGridRowByText, clickRowAction } from "../support/grid";
import { expect, test, type Page } from "../support/fixtures";
import { openDialogFromButton } from "../support/ui";

let seeded: SeededData;
test.beforeAll(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
});

async function createGroup(page: Page, name: string, parent?: string) {
  const dialog = await openDialogFromButton(page, {
    buttonName: "Add Group",
    dialogName: "New Category Group",
  });
  await dialog.getByLabel("Name").fill(name);
  if (parent) {
    await dialog.getByLabel("Parent Category Group").fill(parent);
    await page.getByRole("option", { name: parent, exact: true }).click();
  }
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toBeHidden();
}

test("settings hosts categories without changing primary navigation or general settings", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/settings`);
  await expect(
    page.getByRole("textbox", { name: "Account Book Name", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Categories", exact: true }).click();
  await expect(page).toHaveURL(
    /\/settings\/categories\?tab=EQUITY-INCOME&mode=active$/,
  );
  await expect(
    page
      .getByRole("tablist", { name: "Category Type" })
      .getByRole("tab", { name: "Income", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("textbox", { name: "Account Book Name", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Delete Account Book" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Categories", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Assets", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Income", exact: true }),
  ).toHaveCount(0);
});

test("legacy category links redirect with their tab and archive selection", async ({
  page,
}) => {
  await page.goto(
    `/${seeded.accountBookId}/accounts?tab=EQUITY-EXPENSE&mode=archived`,
  );
  await expect(page).toHaveURL(
    /\/settings\/categories\?tab=EQUITY-EXPENSE&mode=archived$/,
  );
  await expect(
    page
      .getByRole("navigation", { name: "Category Archive" })
      .getByText("Archive", { exact: true }),
  ).toBeVisible();
  await page.goto(`/${seeded.accountBookId}/settings/categories?tab=ASSET`);
  await expect(
    page.getByRole("tab", { name: "Income", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("category groups preserve nesting, category CRUD, ledger access and archives", async ({
  page,
}) => {
  const url = `/${seeded.accountBookId}/settings/categories?tab=EQUITY-EXPENSE&mode=active`;
  await page.goto(url);
  await createGroup(page, "E2E Housing");
  await createGroup(page, "E2E Utilities", "E2E Housing");

  const create = await openDialogFromButton(page, {
    buttonName: "Add Expense Category",
    dialogName: "New Category",
  });
  await create.getByLabel("Name").fill("E2E Electricity");
  await create
    .getByLabel("Category Group", { exact: true })
    .fill("E2E Utilities");
  await page
    .getByRole("option", { name: "E2E Utilities", exact: true })
    .click();
  await create.getByRole("button", { name: "Create", exact: true }).click();
  await expect(create).toBeHidden();

  const sibling = await openDialogFromButton(page, {
    buttonName: "Add Expense Category",
    dialogName: "New Category",
  });
  await sibling.getByLabel("Name").fill("E2E Water");
  await sibling
    .getByLabel("Category Group", { exact: true })
    .fill("E2E Utilities");
  await page
    .getByRole("option", { name: "E2E Utilities", exact: true })
    .click();
  await sibling.getByRole("button", { name: "Create", exact: true }).click();
  await expect(sibling).toBeHidden();

  const housing = agGridRowByText(page, "E2E Housing");
  await expect(housing).toBeVisible();
  const housingExpander = housing.locator(".ag-group-contracted");
  if (await housingExpander.isVisible()) await housingExpander.click();
  const utilities = agGridRowByText(page, "E2E Utilities");
  await expect(utilities).toBeVisible();
  const utilitiesExpander = utilities.locator(".ag-group-contracted");
  if (await utilitiesExpander.isVisible()) await utilitiesExpander.click();
  const electricity = agGridRowByText(page, "E2E Electricity");
  await expect(electricity).toBeVisible();
  await clickRowAction(electricity, "Reorder Siblings");
  const reorder = page.getByRole("dialog", { name: "Reorder Siblings" });
  await expect(reorder.getByText("E2E Water", { exact: true })).toBeVisible();
  await reorder.getByRole("button", { name: "Close", exact: true }).click();

  await clickRowAction(electricity, "Edit");
  const edit = page.getByRole("dialog", { name: "Edit Category" });
  await edit.getByLabel("Name").fill("E2E Electricity Updated");
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  const updated = agGridRowByText(page, "E2E Electricity Updated");
  await expect(updated).toBeVisible();
  await updated.dblclick();
  await expect(
    page.getByRole("heading", { name: "E2E Electricity Updated" }),
  ).toBeVisible();
  await page.goto(url);
  await expect(updated).toBeVisible();
  await clickRowAction(updated, "Archive");
  const archive = page.getByRole("dialog", { name: "Archive Category" });
  await archive.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(updated).toHaveCount(0);

  await page.getByRole("link", { name: "Archive", exact: true }).click();
  await expect(housing).toBeVisible();
  if (await housingExpander.isVisible()) await housingExpander.click();
  await expect(utilities).toBeVisible();
  if (await utilitiesExpander.isVisible()) await utilitiesExpander.click();
  const archived = agGridRowByText(page, "E2E Electricity Updated");
  await expect(archived).toBeVisible();
  await clickRowAction(archived, "Unarchive");
  await expect(archived).toHaveCount(0);
  await page.goto(url);
  await updated.dblclick();
  await page.getByRole("button", { name: "Category Actions" }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  const deletion = page.getByRole("dialog", { name: "Delete Category" });
  await deletion.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(
    /\/settings\/categories\?tab=EQUITY-EXPENSE&mode=active$/,
  );
  await expect(updated).toHaveCount(0);
});

test("General settings saves without a visible page header", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/settings`);
  await expect(
    page
      .getByRole("tablist", { name: "Account Book Settings" })
      .getByRole("tab", { name: "General", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toHaveCount(0);
  const name = page.getByRole("textbox", {
    name: "Account Book Name",
    exact: true,
  });
  await name.fill("E2E Settings Updated");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(name).toHaveValue("E2E Settings Updated");
  await expect(
    page.getByRole("heading", { name: "Danger Zone" }),
  ).toBeVisible();
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [1280, 390]) {
    test(`settings navigation and category toolbar: ${colorScheme}, ${width}px`, async ({
      page,
    }, testInfo) => {
      async function capture(filename: string) {
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
          .toBeLessThanOrEqual(width);
        await page.screenshot({
          path: testInfo.outputPath(filename),
          animations: "disabled",
        });
      }
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${seeded.accountBookId}/settings`);
      const settingsTabs = page.getByRole("tablist", {
        name: "Account Book Settings",
      });
      await expect(
        settingsTabs.getByRole("tab", { name: "General", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("textbox", { name: "Account Book Name", exact: true }),
      ).toBeVisible();
      await capture("general.png");
      await settingsTabs
        .getByRole("tab", { name: "General", exact: true })
        .focus();
      await page.keyboard.press("ArrowRight");
      const categoryTabs = page.getByRole("tablist", { name: "Category Type" });
      const income = categoryTabs.getByRole("tab", {
        name: "Income",
        exact: true,
      });
      const expenses = categoryTabs.getByRole("tab", {
        name: "Expenses",
        exact: true,
      });
      await expect(income).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("button", { name: "Add Income Category" }),
      ).toBeVisible();
      await expect(page.getByRole("treegrid")).toBeVisible();
      await capture("income.png");
      await income.focus();
      await page.keyboard.press("ArrowRight");
      await expect(expenses).toHaveAttribute("aria-selected", "true");
      await expect(page).toHaveURL(/tab=EQUITY-EXPENSE&mode=active$/);
      await expect(
        page.getByRole("button", { name: "Add Expense Category" }),
      ).toBeVisible();
      await capture("expenses.png");
      await page.getByRole("link", { name: "Archive", exact: true }).click();
      const breadcrumb = page.getByRole("navigation", {
        name: "Category Archive",
      });
      await expect(
        breadcrumb.getByText("Archive", { exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expect(expenses).toHaveAttribute("aria-selected", "true");
      await capture("archive.png");
      await breadcrumb
        .getByRole("link", { name: "Categories", exact: true })
        .click();
      await expect(page).toHaveURL(/tab=EQUITY-EXPENSE&mode=active$/);
    });
  }
}

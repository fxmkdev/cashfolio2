import { prisma } from "../support/db-client";
import { seedDatabase, type SeededData } from "../support/db";
import {
  agGridRowByText,
  clickRowAction,
  expandArchivedGroups,
} from "../support/grid";
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

async function setArchivedVisibility(page: Page, showArchived: boolean) {
  const visibility = page.getByRole("checkbox", { name: "Show Archived" });
  if ((await visibility.isChecked()) !== showArchived) await visibility.click();
  if (showArchived) await expect(visibility).toBeChecked();
  else await expect(visibility).not.toBeChecked();
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
    /\/settings\/categories\?tab=EQUITY-INCOME&showArchived=false$/,
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
  ).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Income", exact: true }),
  ).toHaveCount(0);
});

test("legacy category links redirect with their tab and archive selection", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/settings`);
  await expect(
    page.getByRole("textbox", { name: "Account Book Name", exact: true }),
  ).toBeVisible();
  await page.goto(
    `/${seeded.accountBookId}/accounts?tab=EQUITY-EXPENSE&mode=archived`,
  );
  await expect(page).toHaveURL(
    /\/settings\/categories\?tab=EQUITY-EXPENSE&showArchived=true$/,
  );
  await expect(
    page.getByRole("checkbox", { name: "Show Archived" }),
  ).toBeChecked();
  await page.goBack();
  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/settings$`),
  );
  await page.goto(
    `/${seeded.accountBookId}/settings/categories?tab=EQUITY-EXPENSE&mode=archived&showArchived=false`,
  );
  await expect(page).toHaveURL(
    /settings\/categories\?tab=EQUITY-EXPENSE&showArchived=false$/,
  );
  await expect(
    page.getByRole("checkbox", { name: "Show Archived" }),
  ).not.toBeChecked();
  await page.goto(`/${seeded.accountBookId}/settings/categories?tab=ASSET`);
  await expect(
    page.getByRole("tab", { name: "Income", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("category groups preserve nesting, category CRUD, ledger access and archives", async ({
  page,
}) => {
  const url = `/${seeded.accountBookId}/settings/categories?tab=EQUITY-EXPENSE&showArchived=false`;
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

  await setArchivedVisibility(page, true);
  await expect(
    page.getByRole("checkbox", { name: "Show Archived" }),
  ).toBeChecked();
  await expect(housing).toBeVisible();
  if (await housingExpander.isVisible()) await housingExpander.click();
  await expect(utilities).toBeVisible();
  if (await utilitiesExpander.isVisible()) await utilitiesExpander.click();
  await expect(page.locator('[row-id^="__archived__:"]').first()).toBeVisible();
  await expandArchivedGroups(page);
  const archived = agGridRowByText(page, "E2E Electricity Updated");
  await expect(archived).toBeVisible();
  await clickRowAction(archived, "Unarchive");
  await expect(
    archived.getByRole("button", { name: "Unarchive", exact: true }),
  ).toHaveCount(0);
  await page.goto(url);
  await updated.dblclick();
  await page.getByRole("button", { name: "Category Actions" }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  const deletion = page.getByRole("dialog", { name: "Delete Category" });
  await deletion.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(
    /\/settings\/categories\?tab=EQUITY-EXPENSE&showArchived=false$/,
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
      await prisma.account.create({
        data: {
          accountBookId: seeded.accountBookId,
          name: `E2E Archived ${colorScheme} ${width}`,
          type: "EQUITY",
          equityAccountSubtype: "EXPENSE",
          isActive: false,
        },
      });
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${seeded.accountBookId}/settings`);
      const settingsTabs = page.getByRole("tablist", {
        name: "Account Book Settings",
      });
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
      const visibility = page.getByRole("checkbox", { name: "Show Archived" });
      await expect(income).toHaveAttribute("aria-selected", "true");
      await expect(visibility).not.toBeChecked();
      await expect(
        page.getByRole("button", { name: "Add Income Category" }),
      ).toBeVisible();
      await expect(page.getByRole("treegrid")).toBeVisible();
      await capture("income.png");
      await income.focus();
      await page.keyboard.press("ArrowRight");
      await expect(expenses).toHaveAttribute("aria-selected", "true");
      await expect(page).toHaveURL(/tab=EQUITY-EXPENSE&showArchived=false$/);
      await expect(
        page.getByRole("button", { name: "Add Expense Category" }),
      ).toBeVisible();
      await capture("expenses.png");
      await visibility.focus();
      await page.keyboard.press("Space");
      await expect(visibility).toBeChecked();
      await expect(page).toHaveURL(/tab=EQUITY-EXPENSE&showArchived=true$/);
      await capture("with-archived.png");
      await setArchivedVisibility(page, false);
      await expect(page).toHaveURL(/tab=EQUITY-EXPENSE&showArchived=false$/);
    });
  }
}

test("archived visibility follows URLs and history but defaults off on fresh visits", async ({
  page,
}) => {
  await prisma.account.create({
    data: {
      accountBookId: seeded.accountBookId,
      name: "E2E Retired Category",
      type: "EQUITY",
      equityAccountSubtype: "EXPENSE",
      isActive: false,
    },
  });
  await page.goto(
    `/${seeded.accountBookId}/settings/categories?tab=EQUITY-EXPENSE`,
  );
  const visibility = page.getByRole("checkbox", { name: "Show Archived" });
  const retired = agGridRowByText(page, "E2E Retired Category");
  await expect(visibility).not.toBeChecked();
  await expect(retired).toHaveCount(0);
  await setArchivedVisibility(page, true);
  const archive = page.locator('[row-id="__archived__:root"]');
  await expect(archive).toHaveAttribute("aria-expanded", "false");
  await archive.locator(".ag-group-contracted").click();
  await expect(retired).toBeVisible();
  await page.reload();
  await expect(visibility).toBeChecked();
  await expect(retired).toBeVisible();
  await createGroup(page, "E2E Combined Group");
  const create = await openDialogFromButton(page, {
    buttonName: "Add Expense Category",
    dialogName: "New Category",
  });
  await create.getByLabel("Name").fill("E2E Combined Creation");
  await create
    .getByLabel("Category Group", { exact: true })
    .fill("E2E Combined Group");
  await page
    .getByRole("option", { name: "E2E Combined Group", exact: true })
    .click();
  await create.getByRole("button", { name: "Create", exact: true }).click();
  await expect(create).toBeHidden();
  const combinedGroup = agGridRowByText(page, "E2E Combined Group");
  await expect(combinedGroup).toHaveAttribute("aria-expanded", /true|false/);
  if (await combinedGroup.locator(".ag-group-contracted").isVisible())
    await combinedGroup.locator(".ag-group-contracted").click();
  await expect(visibility).toBeChecked();
  const tabs = page.getByRole("tablist", { name: "Category Type" });
  await tabs.getByRole("tab", { name: "Income", exact: true }).click();
  await expect(visibility).toBeChecked();
  await tabs.getByRole("tab", { name: "Expenses", exact: true }).click();
  await expect(visibility).toBeChecked();
  await page.goBack();
  await expect(
    tabs.getByRole("tab", { name: "Income", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(visibility).toBeChecked();
  await page.goForward();
  await setArchivedVisibility(page, false);
  await expect(retired).toHaveCount(0);
  await expect(agGridRowByText(page, "E2E Combined Creation")).toBeVisible();
  await expect(agGridRowByText(page, "E2E Combined Group")).toBeVisible();
  await expect(archive).toHaveCount(0);
  await combinedGroup.locator(".ag-group-expanded").click();
  await page.goBack();
  await expect(visibility).toBeChecked();
  await expect(archive).toHaveAttribute("aria-expanded", "true");
  await expect(retired).toBeVisible();
  await expect(combinedGroup).toHaveAttribute("aria-expanded", "false");
  await page.goForward();
  await expect(visibility).not.toBeChecked();
  const settingsTabs = page.getByRole("tablist", {
    name: "Account Book Settings",
  });
  await settingsTabs.getByRole("tab", { name: "General", exact: true }).click();
  await settingsTabs
    .getByRole("tab", { name: "Categories", exact: true })
    .click();
  await expect(visibility).not.toBeChecked();
});

test("deleting an archived category ledger returns with archived visibility enabled", async ({
  page,
}) => {
  const category = await prisma.account.create({
    data: {
      accountBookId: seeded.accountBookId,
      name: "E2E Archived Deletion",
      type: "EQUITY",
      equityAccountSubtype: "EXPENSE",
      isActive: false,
    },
  });
  await page.goto(`/${seeded.accountBookId}/${category.id}`);
  await page.getByRole("button", { name: "Category Actions" }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Delete Category" })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page).toHaveURL(
    /settings\/categories\?tab=EQUITY-EXPENSE&showArchived=true$/,
  );
  await expect(
    page.getByRole("checkbox", { name: "Show Archived" }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Add Expense Category" }),
  ).toBeVisible();
});

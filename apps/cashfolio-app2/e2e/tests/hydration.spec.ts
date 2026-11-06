import { Buffer } from "node:buffer";
import { seedDatabase, type SeededData } from "../support/db";
import { expect, test, type Page } from "../support/fixtures";
import { agGridRowByText } from "../support/grid";

let seeded: SeededData;

test.beforeEach(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
});

async function beforeHydration(page: Page, check: () => Promise<void>) {
  let release!: () => void;
  const scriptsReady = new Promise<void>((resolve) => {
    release = resolve;
  });
  const scripts = (url: URL) => url.pathname.endsWith(".js");
  await page.route(scripts, async (route) => {
    await scriptsReady;
    await route.continue();
  });
  try {
    await check();
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
}

for (const entity of ["Account", "Category"] as const) {
  test(`${entity} actions stay disabled until hydration and open on the first click`, async ({
    page,
  }) => {
    const account =
      entity === "Account" ? seeded.cashAccount : seeded.expenseAccount;
    const actions = page.getByRole("button", { name: `${entity} Actions` });
    const primaryAction = page.getByRole("button", {
      name: entity === "Account" ? "Import Statement" : "Edit",
      exact: true,
    });
    await beforeHydration(page, async () => {
      await page.goto(`/${seeded.accountBookId}/${account.id}`, {
        waitUntil: "commit",
      });
      await expect(actions).toBeVisible();
      await expect(actions).toBeDisabled();
      await expect(primaryAction).toBeDisabled();
    });

    await expect(primaryAction).toBeEnabled();
    await actions.click();
    await expect(
      page.getByRole("menuitem", { name: "Delete", exact: true }),
    ).toBeVisible();
    if (entity === "Account") {
      await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    } else {
      await page.keyboard.press("Escape");
      await primaryAction.click();
    }
    await expect(
      page.getByRole("dialog", { name: `Edit ${entity}`, exact: true }),
    ).toBeVisible();
  });
}

test("settings stay disabled until hydration and preserve the first edit", async ({
  page,
}) => {
  const name = page.getByRole("textbox", {
    name: "Account Book Name",
    exact: true,
  });
  const save = page.getByRole("button", { name: "Save", exact: true });
  await beforeHydration(page, async () => {
    // The document has committed, but every client module (including the lazy
    // settings view) is still held. These assertions inspect the real SSR UI.
    await page.goto(`/${seeded.accountBookId}/settings`, {
      waitUntil: "commit",
    });
    await expect(name).toBeVisible();
    await expect(name).toBeDisabled();
    await expect(page.getByLabel("Reference Currency")).toBeDisabled();
    await expect(page.getByLabel("Start Date")).toBeDisabled();
    await expect(save).toBeDisabled();
  });

  await expect(name).toBeEnabled();
  await name.fill("Hydrated First Edit");
  await save.click();
  await expect(
    page.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(name).toBeEnabled();
  await expect(name).toHaveValue("Hydrated First Edit");
});

test("settings More menu stays disabled until hydration and opens deletion on the first selection", async ({
  page,
}) => {
  const more = page.getByRole("button", { name: "More Account Book Actions" });
  await beforeHydration(page, async () => {
    await page.goto(`/${seeded.accountBookId}/settings`, {
      waitUntil: "commit",
    });
    await expect(more).toBeVisible();
    await expect(more).toBeDisabled();
  });

  await expect(more).toBeEnabled();
  await more.click();
  await page.getByRole("menuitem", { name: "Delete Account Book…" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete Account Book" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Delete Account Book" }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("textbox", { name: "Account Book Name" }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(more).toBeFocused();
});

test("statement upload stays disabled until hydration and accepts the first file", async ({
  page,
}) => {
  // The file input is hidden inside Mantine Dropzone, which has no accessible
  // name for the input; use its native type to inspect enabled/disabled state.
  const fileInput = page.locator('input[type="file"]');
  await beforeHydration(page, async () => {
    await page.goto(
      `/${seeded.accountBookId}/${seeded.cashAccount.id}/import-statement`,
      { waitUntil: "commit" },
    );
    await expect(page.getByText("Drop CSV file here")).toBeVisible();
    await expect(fileInput).toBeDisabled();
  });

  await expect(fileInput).toBeEnabled();
  await fileInput.setInputFiles({
    name: "first-upload.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "date,amount,original amount,original currency,exchange rate,description\n2026-04-01,-10,,,,Hydrated First Upload",
    ),
  });
  await expect(agGridRowByText(page, "Hydrated First Upload")).toBeVisible();
  await expect(page.getByText("0 of 1 ready", { exact: true })).toBeVisible();
});

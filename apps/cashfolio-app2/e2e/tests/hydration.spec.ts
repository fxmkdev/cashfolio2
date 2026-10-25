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
    const edit = page.getByRole("button", { name: "Edit", exact: true });
    await beforeHydration(page, async () => {
      await page.goto(`/${seeded.accountBookId}/${account.id}`, {
        waitUntil: "commit",
      });
      await expect(actions).toBeVisible();
      await expect(actions).toBeDisabled();
      await expect(edit).toBeDisabled();
    });

    await expect(edit).toBeEnabled();
    await actions.click();
    await expect(
      page.getByRole("menuitem", { name: "Delete", exact: true }),
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
  const deleteBook = page.getByRole("button", { name: "Delete Account Book" });
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
    await expect(deleteBook).toBeDisabled();
  });

  await expect(name).toBeEnabled();
  await expect(deleteBook).toBeEnabled();
  await name.fill("Hydrated First Edit");
  await save.click();
  await expect(
    page.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(name).toBeEnabled();
  await expect(name).toHaveValue("Hydrated First Edit");
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

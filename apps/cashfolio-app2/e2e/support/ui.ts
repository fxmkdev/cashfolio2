import { expect, type Locator, type Page } from "@playwright/test";

type AccessibleName = string | RegExp;

export async function uploadStatementFile(
  page: Page,
  file: Parameters<Locator["setInputFiles"]>[0],
): Promise<void> {
  // Mantine Dropzone's hidden input has no accessible name. setInputFiles
  // does not wait for enabled state, so explicitly wait for lazy hydration.
  const input = page.locator('input[type="file"]');
  await expect(input).toBeEnabled();
  await input.setInputFiles(file);
}

export async function openDialogFromButton(
  page: Page,
  args: {
    buttonName: AccessibleName;
    dialogName: AccessibleName;
    attempts?: number;
  },
): Promise<Locator> {
  const button = page.getByRole("button", { name: args.buttonName });
  const dialog = page.getByRole("dialog", { name: args.dialogName });
  const attempts = args.attempts ?? 3;
  let lastError: unknown;

  await expect(button).toBeVisible({ timeout: 20_000 });

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await button.click();

    try {
      await expect(dialog).toBeVisible({ timeout: 2_500 });
      return dialog;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Failed to open dialog after ${attempts} attempts: ${String(args.dialogName)}`,
    {
      cause: lastError,
    },
  );
}

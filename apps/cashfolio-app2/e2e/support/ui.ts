import { expect, type Locator, type Page } from "@playwright/test";

type AccessibleName = string | RegExp;

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

  await expect(button).toBeVisible();

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

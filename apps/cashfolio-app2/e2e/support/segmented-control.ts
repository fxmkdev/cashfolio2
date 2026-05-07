import { expect, type Locator } from "@playwright/test";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function selectSegmentedControlOption(
  control: Locator,
  optionName: string,
) {
  const option = control.getByRole("radio", { name: optionName });
  const optionLabel = control
    .locator("label")
    .filter({
      hasText: new RegExp(`^\\s*${escapeRegExp(optionName)}\\s*$`),
    })
    .first();

  if (await option.isChecked()) {
    return;
  }

  await control.scrollIntoViewIfNeeded();
  if ((await optionLabel.count()) > 0) {
    await optionLabel.scrollIntoViewIfNeeded();
    await optionLabel.click();
  } else {
    await option.focus();
    await option.press("Space");
  }

  if (!(await option.isChecked())) {
    if ((await optionLabel.count()) > 0) {
      await optionLabel.click();
    } else {
      await option.press("Space");
    }
  }

  await expect(option).toBeChecked({ timeout: 15_000 });
}

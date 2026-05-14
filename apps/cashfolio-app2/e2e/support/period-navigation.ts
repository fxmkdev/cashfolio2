import { expect, type Page } from "@playwright/test";

export async function clickPeriodStepUntilQueryMatches(args: {
  page: Page;
  buttonName: "Previous Period" | "Next Period";
  expectedPeriod: string;
  maxAttempts?: number;
  timeoutMs?: number;
}) {
  const maxAttempts = args.maxAttempts ?? 3;
  const timeoutMs = args.timeoutMs ?? 4_000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const periodBeforeClick = new URL(args.page.url()).searchParams.get(
      "period",
    );
    await args.page.getByRole("button", { name: args.buttonName }).click();
    try {
      await expect
        .poll(() => new URL(args.page.url()).searchParams.get("period"), {
          timeout: timeoutMs,
        })
        .toBe(args.expectedPeriod);
      return;
    } catch {
      const periodAfterClick = new URL(args.page.url()).searchParams.get(
        "period",
      );
      if (periodAfterClick !== periodBeforeClick) {
        throw new Error(
          `Clicked "${args.buttonName}" but period changed to "${periodAfterClick}" instead of "${args.expectedPeriod}".`,
        );
      }
      // Retry only when click did not change the URL period at all.
    }
  }

  throw new Error(
    `Could not navigate to expected period ${args.expectedPeriod}.`,
  );
}

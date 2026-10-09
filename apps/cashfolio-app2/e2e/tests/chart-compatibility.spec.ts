import {
  seedAssetAccountWithMissingReferenceBalance,
  seedDatabase,
  seedNonZeroConvertibleAssetBalances,
  seedSecurityGainLossDrilldownScenario,
  seedThreeBookingSplitTransaction,
  type SeededData,
} from "../support/db";
import { expect, test } from "../support/fixtures";
import { selectSegmentedControlOption } from "../support/segmented-control";

let seeded: SeededData;
test.beforeAll(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
  await seedNonZeroConvertibleAssetBalances({
    accountBookId: seeded.accountBookId,
    counterAccountId: seeded.cashAccount.id,
  });
  await seedThreeBookingSplitTransaction({
    accountBookId: seeded.accountBookId,
    description: "Chart compatibility expenses",
    currentAccountId: seeded.cashAccount.id,
    debitAccountIds: [seeded.expenseAccount.id, seeded.expenseAccount.id],
  });
  await seedSecurityGainLossDrilldownScenario({
    accountBookId: seeded.accountBookId,
    securityAccountId: seeded.securityAccount.id,
    counterAccountId: seeded.securityCounterAccount.id,
  });
  await seedAssetAccountWithMissingReferenceBalance({
    accountBookId: seeded.accountBookId,
    counterAccountId: seeded.cashAccount.id,
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [1280, 390]) {
    test(`report and scoped history charts: ${colorScheme}, ${width}px`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000);
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width, height: 900 });
      const diagnostics: { type: string; text: string }[] = [];
      page.on("console", (message) => {
        if (message.type() === "warning" || message.type() === "error") {
          diagnostics.push({ type: message.type(), text: message.text() });
        }
      });
      page.on("pageerror", (error) =>
        diagnostics.push({ type: "pageerror", text: error.message }),
      );

      await page.goto(`/${seeded.accountBookId}/report?period=2026-02`);
      await expect(
        page.getByRole("heading", { name: "February 2026" }),
      ).toBeVisible();
      await expect(
        page.getByText(
          /skipped because reference-currency balances were unavailable/,
        ),
      ).toBeVisible();
      await expect(
        page.locator(".ag-charts-wrapper canvas").first(),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("report-donut.png"),
        fullPage: true,
      });
      for (const controlName of [
        "Allocation Chart Type",
        "Breakdown Chart Type",
      ]) {
        await selectSegmentedControlOption(
          page.getByRole("radiogroup", { name: controlName }),
          "Bar",
        );
      }
      await page.screenshot({
        path: testInfo.outputPath("report-bar.png"),
        fullPage: true,
      });

      for (const metric of ["netWorth", "gainsLosses", "expenses"]) {
        const scope =
          metric === "expenses"
            ? `&expenseScope=account:${seeded.expenseAccount.id}`
            : "";
        await page.goto(
          `/${seeded.accountBookId}/history?metric=${metric}${scope}`,
        );
        await expect(
          page.getByRole("heading", { name: "History" }),
        ).toBeVisible();
        await expect(
          page.locator(".ag-charts-wrapper canvas").first(),
        ).toBeVisible();
        // AG Charts draws the series and legend in canvas; the range toolbar is DOM.
        const rangeButton = page
          .locator(
            ".ag-charts-range-buttons--buttons .ag-charts-toolbar__button",
          )
          .filter({ hasText: "1Y" });
        await expect(rangeButton).toHaveClass(
          /ag-charts-toolbar__button--active/,
        );
        await page.screenshot({
          path: testInfo.outputPath(`history-${metric}.png`),
          fullPage: true,
        });
        if (metric === "expenses") {
          await expect(page.getByLabel("History Metric Scope")).toHaveValue(
            seeded.expenseAccount.name,
          );
        }
        await selectSegmentedControlOption(
          page.getByRole("radiogroup", { name: "History Period Mode" }),
          "Yearly",
        );
        await expect(
          page
            .locator(
              ".ag-charts-range-buttons--buttons .ag-charts-toolbar__button",
            )
            .filter({ hasText: "5Y" }),
        ).toHaveClass(/ag-charts-toolbar__button--active/);
        await page.screenshot({
          path: testInfo.outputPath(`history-${metric}-yearly.png`),
          fullPage: true,
        });
      }
      await testInfo.attach("browser-diagnostics", {
        body: JSON.stringify(diagnostics, null, 2),
        contentType: "application/json",
      });
      expect(
        diagnostics.filter(
          (entry) =>
            entry.type === "pageerror" || entry.text.startsWith("AG Charts -"),
        ),
      ).toEqual([]);
    });
  }
}

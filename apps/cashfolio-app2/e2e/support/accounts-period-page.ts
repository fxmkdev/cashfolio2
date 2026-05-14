import { expect, type Page } from "@playwright/test";

export function isIgnorableAgChartsError(message: string): boolean {
  const normalizedMessage = message.replace(/\s+/g, " ").trim();
  const ignorableAgChartsErrorPatterns = [
    /^\*+ AG Charts Enterprise License \*+$/i,
    /^\* All AG Charts Enterprise features are unlocked for trial\..*\*$/i,
    /^AG Charts Enterprise:.*license.*$/i,
    /^AG Charts Enterprise:.*watermark.*$/i,
  ];

  return ignorableAgChartsErrorPatterns.some((pattern) =>
    pattern.test(normalizedMessage),
  );
}

export async function doubleClickBreakdownLeafUntilLedgerNavigation(args: {
  page: Page;
  accountBookId: string;
  accountId: string;
  period: string;
}) {
  const breakdownCard = args.page
    .getByRole("heading", { name: "Expenses Breakdown" })
    .locator(
      "xpath=ancestor::*[self::section or self::article or self::div][.//*[@aria-label='Breakdown Chart Type'] and .//canvas][1]",
    );
  const chartContainer = breakdownCard.getByTestId("period-breakdown-chart");
  await expect(chartContainer).toBeVisible();

  const expectedPath = `/${args.accountBookId}/${args.accountId}`;
  const normalizePathname = (pathname: string) =>
    pathname !== "/" && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  const tryExpectLedgerNavigation = async () => {
    await expect
      .poll(
        () => {
          const url = new URL(args.page.url());
          return (
            normalizePathname(url.pathname) === expectedPath &&
            url.searchParams.get("period") === args.period
          );
        },
        { timeout: 5_000 },
      )
      .toBe(true);
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await chartContainer.dblclick({ force: true });
      await tryExpectLedgerNavigation();
      return;
    } catch {
      await args.page.waitForTimeout(150);
    }
  }

  throw new Error(
    "Could not trigger account-leaf drilldown from the period breakdown chart.",
  );
}

export type PeriodPageSessionState = {
  selectedBreakdown: "expense" | "income";
  selectedChartType: "donut" | "bar" | "table";
  selectedAllocationBreakdown: "asset" | "liability";
  selectedAllocationChartType: "donut" | "bar" | "table";
  selectedGainsLossesChartType: "waterfall" | "table";
  drillPathByBreakdown: {
    expense: string[];
    income: string[];
  };
  drillPathByAllocationBreakdown: {
    asset: string[];
    liability: string[];
  };
  drillPathByGainsLosses: string[];
};

export function createPeriodPageSessionState(
  overrides: Partial<PeriodPageSessionState> = {},
): PeriodPageSessionState {
  return {
    selectedBreakdown: overrides.selectedBreakdown ?? "expense",
    selectedChartType: overrides.selectedChartType ?? "donut",
    selectedAllocationBreakdown:
      overrides.selectedAllocationBreakdown ?? "asset",
    selectedAllocationChartType:
      overrides.selectedAllocationChartType ?? "donut",
    selectedGainsLossesChartType:
      overrides.selectedGainsLossesChartType ?? "waterfall",
    drillPathByBreakdown: {
      expense: overrides.drillPathByBreakdown?.expense ?? [],
      income: overrides.drillPathByBreakdown?.income ?? [],
    },
    drillPathByAllocationBreakdown: {
      asset: overrides.drillPathByAllocationBreakdown?.asset ?? [],
      liability: overrides.drillPathByAllocationBreakdown?.liability ?? [],
    },
    drillPathByGainsLosses: overrides.drillPathByGainsLosses ?? [],
  };
}

export async function seedPeriodPageSessionState(args: {
  page: Page;
  accountBookId: string;
  state: PeriodPageSessionState;
}) {
  const key = `cashfolio:periodPageState:${args.accountBookId}`;

  await args.page.addInitScript(
    ({ scriptKey, scriptState }) => {
      window.sessionStorage.setItem(scriptKey, JSON.stringify(scriptState));
    },
    { scriptKey: key, scriptState: args.state },
  );
}

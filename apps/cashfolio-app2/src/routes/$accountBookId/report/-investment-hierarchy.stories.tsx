import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { buildPeriodEndAllocationBreakdown } from "@/server/period/breakdown/period-allocation-breakdown";
import { buildGainsLossesBreakdown } from "@/server/period/breakdown/period-gains-losses-breakdown";
import { buildGainLossAccountAttribution } from "@/server/period/breakdown/period-gain-loss-attribution";
import type { PeriodBaseAssetLiabilityAccount } from "@/server/period/base-data/period-base-data-types";
import { toNumericMoney } from "@/server/money-boundary";
import { toMoney } from "@/shared/money";
import { ReportPageView } from "./-page-view";
import {
  baseOverview,
  clearReportStorySessionStorage,
} from "./-page-view.story-fixtures";
import { getDefaultReportPageSessionState } from "./-selector/-page-session-state";

const bookId = "report-investment-hierarchy";
const groups = [
  { id: "bank", name: "International Investment Bank", parentGroupId: null },
  {
    id: "broker",
    name: "Long-Term Family Investment Portfolio",
    parentGroupId: "bank",
  },
  { id: "other-bank", name: "Other Bank", parentGroupId: null },
];
const groupById = new Map(groups.map((group) => [group.id, group]));
const accounts: PeriodBaseAssetLiabilityAccount[] = [
  {
    id: "apple-one",
    name: "Apple",
    groupId: "broker",
    type: "BALANCE",
    assetClassId: "EQUITIES",
    unit: "SECURITY",
    symbol: "AAPL",
    currency: null,
    cryptocurrency: null,
    tradeCurrency: "USD",
    isCashAccount: false,
  },
  {
    id: "apple-two",
    name: "Apple",
    groupId: "other-bank",
    type: "BALANCE",
    assetClassId: "EQUITIES",
    unit: "SECURITY",
    symbol: "AAPL",
    currency: null,
    cryptocurrency: null,
    tradeCurrency: "EUR",
    isCashAccount: false,
  },
  {
    id: "managed",
    name: "Managed Portfolio",
    groupId: "broker",
    type: "BALANCE",
    assetClassId: "OTHER_ASSETS",
    trackingMethod: "TOTAL_PORTFOLIO_VALUE",
    unit: "CURRENCY",
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    isCashAccount: false,
  },
  {
    id: "cash",
    name: "Cash",
    groupId: "other-bank",
    type: "BALANCE",
    assetClassId: "OTHER_ASSETS",
    unit: "CURRENCY",
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    isCashAccount: false,
  },
];
const accountAttributionById = buildGainLossAccountAttribution({
  baseAssetLiabilityAccounts: accounts,
  transferClearingUnitBuckets: [],
  executionResidualTransactions: [],
});
const allocation = toNumericMoney(
  buildPeriodEndAllocationBreakdown({
    side: "asset",
    grouping: "assetClass",
    groupById,
    items: accounts.map((account) => ({
      accountId: account.id,
      accountName: account.name,
      accountType: account.type,
      groupId: account.groupId,
      assetClassId: account.assetClassId,
      investmentGroup: accountAttributionById.get(account.id)!.investmentGroup,
      convertedBalanceInReferenceCurrency: toMoney(100),
    })),
  }),
);
const gains = toNumericMoney(
  buildGainsLossesBreakdown({
    grouping: "assetClass",
    accounts,
    groupById,
    accountAttributionById,
    referenceCurrency: "CHF",
    contributions: accounts.map((account) => ({
      ...account,
      unit: account.unit!,
      sourceKind: "HOLDING",
      accountId: account.id,
      accountName: account.name,
      realizedGainLoss: toMoney(10),
      unrealizedGainLoss: toMoney(0),
    })),
  }),
);
const overview: typeof baseOverview = {
  ...baseOverview,
  accountBreakdownsByGrouping: {
    ...baseOverview.accountBreakdownsByGrouping,
    assetClass: {
      ...baseOverview.accountBreakdownsByGrouping.assetClass,
      assetBreakdown: allocation,
      gainsLossesBreakdown: gains,
    },
  },
};
const longParentPath =
  "International Investment Bank / Long-Term Family Investment Portfolio";
const investmentId = "allocation-investment:EQUITIES:SECURITY:AAPL";

function storeState(tables: boolean, singleAccount = false) {
  clearReportStorySessionStorage(bookId);
  const state = getDefaultReportPageSessionState();
  state.selectedGrouping = "assetClass";
  if (tables) {
    state.selectedAllocationChartType = "table";
    state.selectedGainsLossesChartType = "table";
    for (const [type, hierarchy] of [
      ["allocation:asset", allocation.hierarchy],
      ["gains-losses:v3", gains.hierarchy],
    ] as const) {
      sessionStorage.setItem(
        `cashfolio:periodExpandedGroups:${bookId}:${type}:assetClass`,
        JSON.stringify(
          hierarchy.flatMap((node) => [
            node.id,
            ...node.children.map((child) => child.id),
          ]),
        ),
      );
    }
  } else if (singleAccount) {
    state.selectedAllocationChartType = "bar";
    state.drillPathsByGrouping.assetClass.allocation.asset = [
      "asset-class:OTHER_ASSETS",
    ];
  } else {
    state.selectedAllocationChartType = "bar";
    state.drillPathsByGrouping.assetClass.allocation.asset = [
      "asset-class:EQUITIES",
      investmentId,
    ];
  }
  sessionStorage.setItem(
    `cashfolio:reportPageState:${bookId}`,
    JSON.stringify(state),
  );
}

const meta = {
  title: "Routes/ReportInvestmentHierarchy",
  component: ReportPageView,
  args: {
    accountBookId: bookId,
    overview,
    selectedPeriodValue: "2026-02",
    onPeriodChange: fn(),
    onBreakdownAccountDoubleClick: fn(),
    onGainLossUnitAccountDoubleClick: fn(),
  },
  loaders: [
    () => {
      storeState(true);
      return {};
    },
  ],
} satisfies Meta<typeof ReportPageView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TablesWithLongPaths: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const allocationTable = within(
      await canvas.findByTestId("period-allocation-breakdown-table"),
    );
    const gainsTable = within(
      await canvas.findByTestId("period-gains-losses-breakdown-table"),
    );
    for (const table of [allocationTable, gainsTable]) {
      await expect(
        await table.findByText("Managed Portfolios", { exact: true }),
      ).toBeVisible();
      await expect(table.getByText("CHF", { exact: true })).toBeVisible();
      await expect(table.getByText("AAPL", { exact: true })).toBeVisible();
      const apples = table.getAllByText("Apple", { exact: true });
      await expect(apples).toHaveLength(2);
      const row = apples[0].closest<HTMLElement>("[role='row']")!;
      await expect(within(row).getByText(longParentPath)).toBeVisible();
      const pathBox = within(row)
        .getByText(longParentPath)
        .getBoundingClientRect();
      await expect(row.getBoundingClientRect().bottom).toBeGreaterThanOrEqual(
        pathBox.bottom,
      );
    }
    await userEvent.dblClick(
      allocationTable.getAllByText("Apple", { exact: true })[0],
    );
    await expect(args.onBreakdownAccountDoubleClick).toHaveBeenCalledWith(
      "apple-one",
    );
    await expect(args.onBreakdownAccountDoubleClick).toHaveBeenCalledTimes(1);
    await userEvent.dblClick(
      gainsTable.getAllByText("Apple", { exact: true })[1],
    );
    await expect(args.onGainLossUnitAccountDoubleClick).toHaveBeenCalledWith(
      "apple-two",
    );
    await expect(args.onGainLossUnitAccountDoubleClick).toHaveBeenCalledTimes(
      1,
    );
  },
};

export const AllocationAccountPaths: Story = {
  loaders: [
    () => {
      storeState(false);
      return {};
    },
  ],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const chart = await canvas.findByTestId(
      "period-allocation-breakdown-chart",
    );
    await expect(canvas.getByText("AAPL", { exact: true })).toBeVisible();
    for (const [index, path, id] of [
      [0, `${longParentPath} / Apple`, "apple-one"],
      [1, "Other Bank / Apple", "apple-two"],
    ] as const) {
      let target: HTMLElement;
      let coords: { clientX: number; clientY: number };
      await waitFor(async () => {
        target = chart.querySelector<HTMLElement>(".ag-charts-series-area")!;
        expect(target).toBeTruthy();
        const box = target.getBoundingClientRect();
        coords = {
          clientX: box.left + box.width * (index === 0 ? 0.25 : 0.75),
          clientY: box.top + box.height * 0.5,
        };
        await userEvent.pointer({ target, coords });
        const tooltip =
          canvasElement.ownerDocument.querySelector(".ag-charts-tooltip");
        expect(tooltip).toBeVisible();
        expect(tooltip).toHaveTextContent(path);
      });
      await userEvent.pointer({
        target: target!,
        coords: coords!,
        keys: "[MouseLeft][MouseLeft]",
      });
      await waitFor(() => {
        expect(args.onBreakdownAccountDoubleClick).toHaveBeenLastCalledWith(id);
        expect(args.onBreakdownAccountDoubleClick).toHaveBeenCalledTimes(
          index + 1,
        );
      });
    }
  },
};

export const SingleManagedPortfolio: Story = {
  args: {
    overview: {
      ...overview,
      accountBreakdownsByGrouping: {
        ...overview.accountBreakdownsByGrouping,
        assetClass: {
          ...overview.accountBreakdownsByGrouping.assetClass,
          assetBreakdown: {
            ...allocation,
            totalAmount: 100,
            items: allocation.items
              .filter((node) => node.id === "asset-class:OTHER_ASSETS")
              .map((node) => ({ ...node, amount: 100, percentage: 100 })),
            hierarchy: allocation.hierarchy
              .filter((node) => node.id === "asset-class:OTHER_ASSETS")
              .map((node) => ({
                ...node,
                amount: 100,
                children: node.children.filter(
                  (child) => child.label === "Managed Portfolios",
                ),
              })),
          },
        },
      },
    },
  },
  loaders: [
    () => {
      storeState(false, true);
      return {};
    },
  ],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const chart = await canvas.findByTestId(
      "period-allocation-breakdown-chart",
    );
    await userEvent.dblClick(chart);
    await expect(
      await canvas.findByText("Managed Portfolios", { exact: true }),
    ).toBeVisible();
    await expect(args.onBreakdownAccountDoubleClick).not.toHaveBeenCalled();
    await userEvent.dblClick(chart);
    await waitFor(() => {
      expect(args.onBreakdownAccountDoubleClick).toHaveBeenCalledWith(
        "managed",
      );
      expect(args.onBreakdownAccountDoubleClick).toHaveBeenCalledTimes(1);
    });
    await userEvent.click(
      within(chart.closest<HTMLElement>(".mantine-Card-root")!).getByRole(
        "button",
        { name: "Up" },
      ),
    );
    await waitFor(() =>
      expect(
        within(chart.closest<HTMLElement>(".mantine-Card-root")!).queryByText(
          "Managed Portfolios",
          { exact: true },
        ),
      ).not.toBeInTheDocument(),
    );
  },
};

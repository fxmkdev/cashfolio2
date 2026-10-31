import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { mockColors } from "../../history/-chart-test-helpers";
import { usePeriodGainsLossesViewModel } from "../-period-gains-losses-view-model";
import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";
import { GainsLossesCard } from "./-gains-losses-card";
import { ensureChartModulesRegistered } from "@/ag-chart-modules";

ensureChartModulesRegistered();

function NavigationHarness({
  accountCount,
  duplicateNames,
  onOpen,
}: {
  accountCount: number;
  duplicateNames?: boolean;
  onOpen: (id: string) => void;
}) {
  const [path, setPath] = useState<string[]>([]);
  const accounts: GainsLossesBreakdownNode[] = Array.from(
    { length: accountCount },
    (_, index) => ({
      id: `gain-loss-account:usd-${index}`,
      label: duplicateNames ? "USD Account" : `USD Account ${index + 1}`,
      realizedGainLoss: 10,
      unrealizedGainLoss: 0,
      totalGainLoss: 10,
      children: [],
      account: {
        id: `usd-${index}`,
        assetClass: "CASH_AND_CASH_EQUIVALENTS",
        kind: "account",
        explanation: null,
        legacyScopes: [],
        sources: ["HOLDING"],
        instrumentLabel: "USD",
        calculatedRealizedGainLoss: 10,
        calculatedUnrealizedGainLoss: 0,
        recordedGainLoss: 0,
      },
    }),
  );
  const unit: GainsLossesBreakdownNode = {
    id: "gain-loss-investment:CASH_AND_CASH_EQUIVALENTS:CURRENCY:USD",
    label: "USD",
    realizedGainLoss: accountCount * 10,
    unrealizedGainLoss: 0,
    totalGainLoss: accountCount * 10,
    children: accounts,
  };
  const hierarchy = [
    {
      ...unit,
      id: "asset-class:CASH_AND_CASH_EQUIVALENTS",
      label: "Cash & Cash Equivalents",
      children: [unit],
    },
  ];
  const model = usePeriodGainsLossesViewModel({
    accountBookId: "navigation-regression",
    grouping: "assetClass",
    gainsLossesBreakdown: {
      hierarchy,
      realizedGainLoss: accountCount * 10,
      unrealizedGainLoss: 0,
      totalGainLoss: accountCount * 10,
    },
    selectedGainsLossesChartType: "waterfall",
    drillPathByGainsLosses: path,
    setDrillPathByGainsLosses: setPath,
    currencyFormatter: new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "CHF",
    }),
    colors: mockColors,
    waterfallPalette: {
      positive: "#00aa00",
      negative: "#aa0000",
      total: "#888888",
    },
    onUnitAccountDoubleClick: onOpen,
  });
  return (
    <div style={{ width: 640 }}>
      <output data-testid="navigation-depth">{path.length}</output>
      <GainsLossesCard
        grouping="assetClass"
        selectedChartType="waterfall"
        displayDecimals={2}
        tableExpandedGroupsStorageKey="navigation-regression"
        subtitle={model.gainsLossesSubtitle}
        breadcrumbs={model.gainsLossesDrillState.breadcrumbs}
        clampedPath={model.gainsLossesDrillState.clampedPath}
        hasGainsLosses={model.hasGainsLosses}
        emptyMessage={model.emptyGainsLossesMessage}
        hierarchy={hierarchy}
        chartOptions={{
          ...model.gainsLossesChartOptions,
          animation: { enabled: false },
        }}
        onSelectedChartTypeChange={() => undefined}
        onDrillPathChange={setPath}
        onChartContainerDoubleClick={model.handleChartContainerDoubleClick}
        onUnitAccountDoubleClick={onOpen}
      />
    </div>
  );
}

const meta = {
  title: "Routes/Report/GainsLossesNavigation",
  component: NavigationHarness,
  args: { accountCount: 1, onOpen: fn() },
} satisfies Meta<typeof NavigationHarness>;
export default meta;
type Story = StoryObj<typeof meta>;

async function pointAtBar(
  container: HTMLElement,
  label: string,
  multiple = false,
  second = false,
) {
  let target: HTMLElement;
  let coords: { clientX: number; clientY: number };
  await waitFor(async () => {
    target = container.querySelector<HTMLElement>(".ag-charts-series-area")!;
    expect(target).toBeTruthy();
    const box = target.getBoundingClientRect();
    expect(box.width).toBeGreaterThan(0);
    coords = {
      clientX: box.left + box.width * (multiple && !second ? 1 / 6 : 0.5),
      clientY: box.top + box.height * (multiple ? (second ? 0.25 : 0.75) : 0.5),
    };
    await userEvent.pointer({ target, coords });
    const tooltip = container.ownerDocument.querySelector(".ag-charts-tooltip");
    expect(tooltip).toBeVisible();
    expect(tooltip).toHaveTextContent(label);
  });
  return { target: target!, coords: coords! };
}

const exercise: NonNullable<Story["play"]> = async ({
  canvasElement,
  args,
}) => {
  const canvas = within(canvasElement);
  const chart = await canvas.findByTestId(
    "period-gains-losses-breakdown-chart",
  );
  const depth = canvas.getByTestId("navigation-depth");
  const classBar = await pointAtBar(chart, "Cash & Cash Equivalents");
  await userEvent.pointer({ ...classBar, keys: "[MouseLeft]" });
  await expect(depth).toHaveTextContent("0");
  await expect(args.onOpen).not.toHaveBeenCalled();
  await userEvent.pointer({ ...classBar, keys: "[MouseLeft][MouseLeft]" });
  await waitFor(() => expect(depth).toHaveTextContent("1"));
  await expect(args.onOpen).not.toHaveBeenCalled();
  const unitBar = await pointAtBar(chart, "USD");
  await userEvent.pointer({ ...unitBar, keys: "[MouseLeft][MouseLeft]" });
  await waitFor(() => expect(depth).toHaveTextContent("2"));
  await expect(args.onOpen).not.toHaveBeenCalled();
  const accountBar = await pointAtBar(
    chart,
    args.duplicateNames ? "USD Account" : "USD Account 1",
    args.accountCount > 1,
  );
  await userEvent.pointer({ ...accountBar, keys: "[MouseLeft][MouseLeft]" });
  await waitFor(() => expect(args.onOpen).toHaveBeenCalledTimes(1));
  await expect(args.onOpen).toHaveBeenCalledWith("usd-0");
  if (args.duplicateNames) {
    const secondBar = await pointAtBar(chart, "USD Account", true, true);
    await userEvent.pointer({ ...secondBar, keys: "[MouseLeft][MouseLeft]" });
    await waitFor(() => expect(args.onOpen).toHaveBeenCalledTimes(2));
    await expect(args.onOpen).toHaveBeenLastCalledWith("usd-1");
  }
  await userEvent.click(canvas.getByRole("button", { name: /^Up$/ }));
  await expect(depth).toHaveTextContent("1");
  await userEvent.click(canvas.getByText("All Gains/Losses", { exact: true }));
  await expect(depth).toHaveTextContent("0");
  await userEvent.dblClick(chart);
  await expect(depth).toHaveTextContent("1");
  await expect(args.onOpen).toHaveBeenCalledTimes(args.duplicateNames ? 2 : 1);
};

export const SingleAccount: Story = { play: exercise };
export const MultipleAccounts: Story = {
  args: { accountCount: 2 },
  play: exercise,
};

export const DuplicateAccountNames: Story = {
  args: { accountCount: 2, duplicateNames: true },
  play: exercise,
};

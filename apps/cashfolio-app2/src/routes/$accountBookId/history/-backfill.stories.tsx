import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Button, Group, TextInput } from "@mantine/core";
import { useState } from "react";
import { Temporal } from "@/shared/temporal";
import type { PeriodHistoryResponse } from "@/server/period-history";
import { HistoryChart } from "./-chart";
import { useHistoryChartModel } from "./-use-chart-model";
import type { HistoryMetric } from "./-page-types";

const points: PeriodHistoryResponse["points"] = Array.from(
  { length: 36 },
  (_, index) => {
    const month = Temporal.PlainYearMonth.from("2024-01").add({
      months: index,
    });
    return {
      periodValue: month.toString(),
      periodLabel: month.toString(),
      periodEndDate:
        month.toPlainDate({ day: month.daysInMonth }).toString() +
        "T00:00:00.000Z",
      totalReturn: 1,
      savings: 1,
      cashFlow: 1,
      income: 1,
      expenses: 0,
      gainsLosses: 0,
      assets: 1,
      liabilities: 0,
      netWorth: 1,
    };
  },
);
const history: PeriodHistoryResponse = {
  referenceCurrency: "CHF",
  hasCashAccounts: true,
  points,
  openingBalancePoint: {
    date: "2023-12-31T00:00:00.000Z",
    label: "Opening Balance",
    assets: 0,
    liabilities: 0,
    netWorth: 0,
  },
  scopeOptions: {
    cashFlow: [],
    income: [],
    expenses: [],
    gainsLosses: [],
    netWorth: [],
  },
  scopeSelection: {
    cashFlow: "total",
    income: "total",
    expenses: "total",
    gainsLosses: "total",
    netWorth: "total",
  },
};

function BackfillChart({ metric = "income" }: { metric?: HistoryMetric }) {
  const [phase, setPhase] = useState(0);
  const [state, setState] = useState("");
  const model = useHistoryChartModel({
    accountBookId: "story",
    selectedMode: "month",
    selectedMetric: metric,
    history: {
      ...history,
      points: phase === 0 ? points.slice(-24) : points,
      openingBalancePoint: phase < 2 ? null : history.openingBalancePoint,
    },
    isHistoryComplete: phase === 2,
    drillTarget: null,
    onAccountPeriodDoubleClick: fn(),
  });
  return (
    <>
      <Group>
        <Button onClick={() => setPhase(1)}>Prepend Older Points</Button>
        <Button onClick={() => setPhase(2)}>Complete History</Button>
        <Button
          onClick={async () => {
            await model.chartRef.current?.waitForUpdate();
            const current = model.chartRef.current?.getState();
            setState(
              JSON.stringify({
                rangeX: current?.zoom?.rangeX,
                legend: current?.legend,
              }),
            );
          }}
        >
          Read Chart State
        </Button>
      </Group>
      <TextInput label="Chart State" value={state} readOnly />
      <div style={{ height: 500 }}>
        <HistoryChart {...model} />
      </div>
    </>
  );
}

const meta = {
  title: "Screens/History/Backfill",
  component: BackfillChart,
} satisfies Meta<typeof BackfillChart>;
export default meta;
type Story = StoryObj<typeof meta>;

async function checkBackfillState(
  canvasElement: HTMLElement,
  toggleLegend: boolean,
) {
  const canvas = within(canvasElement);
  const capture = canvas.getByRole("button", { name: "Read Chart State" });
  const state = canvas.getByRole("textbox", { name: "Chart State" });
  await waitFor(async () => {
    await userEvent.click(capture);
    expect(JSON.parse((state as HTMLInputElement).value).rangeX).toBeDefined();
  });
  if (toggleLegend)
    await userEvent.click(
      canvas.getByRole("switch", { name: /^Cumulative Income, Legend item/ }),
    );
  await userEvent.click(capture);
  const initial = (state as HTMLInputElement).value;
  if (toggleLegend)
    expect(
      JSON.parse(initial).legend.find(
        (item: { itemId: string }) => item.itemId === "cumulativeMetric",
      ).visible,
    ).toBe(true);
  await userEvent.click(
    canvas.getByRole("button", { name: "Prepend Older Points" }),
  );
  await userEvent.click(capture);
  await expect(state).toHaveValue(initial);
  await userEvent.click(
    canvas.getByRole("button", { name: "Complete History" }),
  );
  await waitFor(() =>
    expect(canvas.getByRole("button", { name: /^All$/ })).toHaveAttribute(
      "aria-disabled",
      "false",
    ),
  );
  await userEvent.click(capture);
  await expect(state).toHaveValue(initial);
}

export const PreservesViewportAndLegend: Story = {
  play: async ({ canvasElement }) => checkBackfillState(canvasElement, true),
};

export const PreservesBalanceViewport: Story = {
  args: { metric: "netWorth" },
  play: async ({ canvasElement }) => checkBackfillState(canvasElement, false),
};

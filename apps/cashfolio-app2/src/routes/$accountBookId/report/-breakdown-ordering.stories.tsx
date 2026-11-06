import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { ReportPageView } from "./-page-view";
import {
  baseOverview,
  clearReportStorySessionStorage,
} from "./-page-view.story-fixtures";

const bookId = "report-bar-ordering";
function hierarchy(signed: boolean) {
  return [
    {
      id: "account:smaller",
      label: signed ? "Negative Category" : "Smaller Category",
      kind: "account" as const,
      amount: signed ? -100 : 100,
      children: [],
    },
    {
      id: "account:largest",
      label: "Largest Category",
      kind: "account" as const,
      amount: 400,
      children: [],
    },
  ];
}
const overview = {
  ...baseOverview,
  expenseBreakdown: {
    ...baseOverview.expenseBreakdown,
    hierarchy: hierarchy(false),
    totalAmount: 500,
  },
  incomeBreakdown: {
    ...baseOverview.incomeBreakdown,
    hierarchy: hierarchy(false),
    totalAmount: 500,
  },
  cashFlowBreakdown: {
    ...baseOverview.cashFlowBreakdown,
    hierarchy: hierarchy(true),
    totalAmount: 300,
  },
};

const meta = {
  title: "Routes/ReportBreakdownOrdering",
  component: ReportPageView,
  args: {
    accountBookId: bookId,
    overview,
    selectedPeriodValue: overview.selectedPeriodValue,
    onPeriodChange: fn(),
    onBreakdownAccountDoubleClick: fn(),
  },
  loaders: [
    () => {
      clearReportStorySessionStorage(bookId);
      return {};
    },
  ],
} satisfies Meta<typeof ReportPageView>;
export default meta;
type Story = StoryObj<typeof meta>;

async function expectTopToBottom(
  canvasElement: HTMLElement,
  mode: "Expenses" | "Income" | "Cash Flow",
) {
  const canvas = within(canvasElement);
  const typeControl = within(await canvas.findByLabelText("Breakdown Type"));
  await userEvent.click(typeControl.getByRole("radio", { name: mode }));
  const chart = await canvas.findByTestId("period-breakdown-chart");
  chart.scrollIntoView({ block: "center" });
  const signed = mode === "Cash Flow";
  for (const [verticalFraction, horizontalFraction, label, amount] of [
    [0.25, signed ? 0.6 : 0.1, "Largest Category", "400"],
    [
      0.75,
      0.1,
      signed ? "Negative Category" : "Smaller Category",
      signed ? /-.*100/ : "100",
    ],
  ] as const) {
    await waitFor(async () => {
      const target = chart.querySelector<HTMLElement>(".ag-charts-series-area");
      expect(target).toBeTruthy();
      const box = target!.getBoundingClientRect();
      await userEvent.pointer({
        target: target!,
        coords: {
          clientX: box.left + box.width * horizontalFraction,
          clientY: box.top + box.height * verticalFraction,
        },
      });
      const tooltip = chart.querySelector(".ag-charts-tooltip");
      expect(tooltip).toBeVisible();
      expect(tooltip).toHaveTextContent(label);
      expect(tooltip).toHaveTextContent(amount);
    });
  }
}

export const ExpensesLargestFirst: Story = {
  play: async ({ canvasElement }) =>
    expectTopToBottom(canvasElement, "Expenses"),
};
export const IncomeLargestFirst: Story = {
  play: async ({ canvasElement }) => expectTopToBottom(canvasElement, "Income"),
};
export const CashFlowSignedOrder: Story = {
  play: async ({ canvasElement }) =>
    expectTopToBottom(canvasElement, "Cash Flow"),
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Group } from "@mantine/core";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { ReportPageView, type ReportPageViewProps } from "./-page-view";
import {
  baseOverview,
  clearReportStorySessionStorage,
} from "./-page-view.story-fixtures";

const bookId = "report-other-allocation";
const hierarchy = [500, 400, 300, 200, 100, 50].map((amount, index) => ({
  id: index === 4 ? "group:other-group" : `account:other-${index}`,
  label: index === 4 ? "Smaller Group" : `Account ${index}`,
  kind: index === 4 ? ("group" as const) : ("account" as const),
  amount,
  children:
    index === 4
      ? [30, 25, 20, 15, 6, 4].map((childAmount, childIndex) => ({
          id: `account:child-${childIndex}`,
          label: `Child ${childIndex}`,
          kind: "account" as const,
          amount: childAmount,
          children: [],
        }))
      : [],
}));
function withAllocation(
  grouping: typeof baseOverview.accountBreakdownsByGrouping.accountStructure,
  nodes = hierarchy,
) {
  const items = nodes.map(({ id, label, kind, amount }) => ({
    id,
    label,
    kind,
    amount,
    percentage: (amount / 1550) * 100,
  }));
  return {
    ...grouping,
    assetBreakdown: {
      ...grouping.assetBreakdown,
      hierarchy: nodes,
      totalAmount: 1550,
      items,
    },
    liabilityBreakdown: {
      ...grouping.liabilityBreakdown,
      hierarchy: nodes,
      totalAmount: 1550,
      items,
    },
  };
}
const overview = {
  ...baseOverview,
  accountBreakdownsByGrouping: {
    accountStructure: withAllocation(
      baseOverview.accountBreakdownsByGrouping.accountStructure,
    ),
    assetClass: withAllocation(
      baseOverview.accountBreakdownsByGrouping.assetClass,
    ),
  },
};

function ContextHarness(props: ReportPageViewProps) {
  const [period, setPeriod] = useState(props.overview.selectedPeriodValue);
  const [book, setBook] = useState(bookId);
  return (
    <>
      <Group>
        <Button
          onClick={() =>
            setPeriod((value) => (value === "2026-02" ? "2026-03" : "2026-02"))
          }
        >
          Change Period Externally
        </Button>
        <Button
          onClick={() =>
            setBook((value) => (value === bookId ? `${bookId}-second` : bookId))
          }
        >
          Change Book Externally
        </Button>
      </Group>
      <ReportPageView
        {...props}
        accountBookId={book}
        selectedPeriodValue={period}
        overview={{ ...props.overview, selectedPeriodValue: period }}
      />
    </>
  );
}

const meta = {
  title: "Routes/ReportOtherAllocation",
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
      clearReportStorySessionStorage(`${bookId}-second`);
      return {};
    },
  ],
} satisfies Meta<typeof ReportPageView>;
export default meta;
type Story = StoryObj<typeof meta>;

async function openOther(canvasElement: HTMLElement) {
  const button = await within(canvasElement).findByRole("button", {
    name: "View Other Categories",
  });
  button.focus();
  await userEvent.keyboard("{Enter}");
  const dialog = await screen.findByRole("dialog", {
    name: "Other Allocation",
  });
  await waitFor(() =>
    expect(within(dialog).getByText("Subtotal", { exact: true })).toBeVisible(),
  );
  return within(dialog);
}

export const OtherDetailsAndNavigation: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const allocationModes = within(
      await canvas.findByLabelText("Allocation Chart Type"),
    );
    const breakdownModes = within(
      canvas.getByLabelText("Breakdown Chart Type"),
    );
    await expect(
      allocationModes.queryByRole("radio", { name: "Bar" }),
    ).not.toBeInTheDocument();
    await expect(
      breakdownModes.queryByRole("radio", { name: "Donut" }),
    ).not.toBeInTheDocument();
    await expect(
      breakdownModes.getByRole("radio", { name: "Bar" }),
    ).toBeChecked();
    const dialog = await openOther(canvasElement);
    await expect(
      dialog.getByText("Smaller Group", { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText("Account 5", { exact: true })).toBeVisible();
    await expect(
      dialog.queryByText("Account 0", { exact: true }),
    ).not.toBeInTheDocument();
    await expect(dialog.getByText("6.5%", { exact: true })).toBeVisible();
    await expect(dialog.getByText("3.2%", { exact: true })).toBeVisible();
    await expect(dialog.getByText("9.7%", { exact: true })).toBeVisible();
    const drill = dialog.getByRole("button", {
      name: "Drill Down: Smaller Group",
    });
    drill.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Other Allocation" }),
      ).not.toBeInTheDocument(),
    );
    await expect(
      canvas.getByText("Smaller Group", { exact: true }),
    ).toBeVisible();
    await expect(args.onBreakdownAccountDoubleClick).not.toHaveBeenCalled();
    const nestedDialog = await openOther(canvasElement);
    await expect(nestedDialog.getByText("6.0%", { exact: true })).toBeVisible();
    await userEvent.dblClick(
      nestedDialog.getByText("Child 5", { exact: true }),
    );
    await expect(args.onBreakdownAccountDoubleClick).toHaveBeenCalledWith(
      "child-5",
    );
    await expect(args.onBreakdownAccountDoubleClick).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Other Allocation" }),
      ).not.toBeInTheDocument(),
    );
    const card = within(
      canvas
        .getByRole("heading", { name: "Assets Allocation" })
        .closest<HTMLElement>(".mantine-Card-root")!,
    );
    await userEvent.click(card.getByRole("button", { name: "Up" }));
    const rootDialog = await openOther(canvasElement);
    await userEvent.click(
      rootDialog.getByRole("button", { name: "Open Ledger: Account 5" }),
    );
    await expect(args.onBreakdownAccountDoubleClick).toHaveBeenLastCalledWith(
      "other-5",
    );
    await expect(args.onBreakdownAccountDoubleClick).toHaveBeenCalledTimes(2);
    await userEvent.click(
      allocationModes.getByRole("radio", { name: "Table" }),
    );
    await expect(
      await canvas.findByTestId("period-allocation-breakdown-table"),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "View Other Categories" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        JSON.parse(
          sessionStorage.getItem(`cashfolio:reportPageState:${bookId}`)!,
        ).selectedAllocationChartType,
      ).toBe("table"),
    );
    await userEvent.click(
      allocationModes.getByRole("radio", { name: "Donut" }),
    );
    await openOther(canvasElement);
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Other Allocation" }),
      ).not.toBeInTheDocument(),
    );
  },
};

export const ContextChangesCloseDetails: Story = {
  render: (args) => <ContextHarness {...args} />,
  play: async ({ canvasElement }) => {
    for (const name of ["Change Period Externally", "Change Book Externally"]) {
      for (let visit = 0; visit < 2; visit++) {
        await openOther(canvasElement);
        // Simulate a context update arriving while the modal blocks pointer input.
        within(canvasElement).getByRole("button", { name }).click();
        await waitFor(() =>
          expect(
            screen.queryByRole("dialog", { name: "Other Allocation" }),
          ).not.toBeInTheDocument(),
        );
      }
    }
  },
};

export const OtherSliceOpensDetails: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const chart = await canvas.findByTestId(
      "period-allocation-breakdown-chart",
    );
    chart.scrollIntoView({ block: "center" });
    let target: HTMLElement;
    let coords: { clientX: number; clientY: number };
    await waitFor(async () => {
      target = chart.querySelector<HTMLElement>(".ag-charts-series-area")!;
      expect(target).toBeTruthy();
      const box = target.getBoundingClientRect();
      const angle = 2 * Math.PI * (1 - 150 / 1550 / 2) - Math.PI / 2;
      const radius = Math.min(box.width, box.height) * 0.42;
      coords = {
        clientX: box.left + box.width / 2 + Math.cos(angle) * radius,
        clientY: box.top + box.height / 2 + Math.sin(angle) * radius,
      };
      await userEvent.pointer({ target, coords });
      const tooltip = chart.querySelector(".ag-charts-tooltip");
      expect(tooltip).toBeVisible();
      expect(tooltip).toHaveTextContent("Other");
      expect(tooltip).toHaveTextContent("9.7%");
    });
    await userEvent.pointer({
      target: target!,
      coords: coords!,
      keys: "[MouseLeft][MouseLeft]",
    });
    const dialog = await screen.findByRole("dialog", {
      name: "Other Allocation",
    });
    await waitFor(() =>
      expect(
        within(dialog).getByText("Subtotal", { exact: true }),
      ).toBeVisible(),
    );
    await expect(args.onBreakdownAccountDoubleClick).not.toHaveBeenCalled();
    await expect(
      JSON.parse(sessionStorage.getItem(`cashfolio:reportPageState:${bookId}`)!)
        .drillPathsByGrouping.accountStructure.allocation.asset,
    ).toEqual([]);
    await userEvent.keyboard("{Escape}");
  },
};

export const NarrowLayout: Story = {
  globals: { viewport: { value: "cashfolioMobile", isRotated: false } },
};

const syntheticHierarchy = hierarchy.map((node) =>
  node.id === "account:other-5"
    ? {
        ...node,
        id: "account:virtual:transfer-clearing:account:currency:USD",
        label: "USD Transfer Clearing",
      }
    : node,
);

export const SyntheticBalancesHaveNoLedger: Story = {
  args: {
    overview: {
      ...overview,
      accountBreakdownsByGrouping: {
        accountStructure: withAllocation(
          baseOverview.accountBreakdownsByGrouping.accountStructure,
          syntheticHierarchy,
        ),
        assetClass: withAllocation(
          baseOverview.accountBreakdownsByGrouping.assetClass,
          syntheticHierarchy,
        ),
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const dialog = await openOther(canvasElement);
    const balance = dialog.getByText("USD Transfer Clearing", { exact: true });
    await expect(balance).toBeVisible();
    await expect(
      dialog.queryByRole("button", {
        name: "Open Ledger: USD Transfer Clearing",
      }),
    ).not.toBeInTheDocument();
    await expect(dialog.getByText("9.7%", { exact: true })).toBeVisible();
    await userEvent.dblClick(balance);
    await expect(args.onBreakdownAccountDoubleClick).not.toHaveBeenCalled();
    await expect(balance).toBeVisible();
    await userEvent.click(
      dialog.getByRole("button", { name: "Drill Down: Smaller Group" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Other Allocation" }),
      ).not.toBeInTheDocument(),
    );
    await expect(
      within(canvasElement).getByText("Smaller Group", { exact: true }),
    ).toBeVisible();
  },
};

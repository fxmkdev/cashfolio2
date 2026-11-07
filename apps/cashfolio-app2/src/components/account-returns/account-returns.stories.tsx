import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Drawer } from "@mantine/core";
import { useState, useEffect, useRef } from "react";
import { expect, fn, userEvent, within, waitFor } from "storybook/test";
import type { GridApi } from "ag-grid-enterprise";
import { DataGrid } from "@/components/grid/data-grid";
import { UserLocaleProvider } from "@/user-locale-context";
import type {
  AccountReturnDetails,
  AccountReturnSummaries,
  AccountReturnTarget,
} from "@/shared/account-returns";
import { buildAccountReturnColumns } from "@/components/account-management/return-columns";
import { AccountReturnSummaryView } from "./return-summary";
import { ReturnCalculation } from "./return-calculation";

const data: AccountReturnDetails = {
  applicable: true,
  twr: 0.21,
  mwr: 0.21,
  annualizedTwr: 0.1,
  annualizedMwr: 0.1,
  effectiveStartDate: "2025-01-01",
  effectiveEndDate: "2026-12-31",
  diagnostics: [],
  startDate: "2025-01-01",
  asOfDate: "2026-12-31",
  referenceCurrency: "CHF",
  name: "Investments",
  valuations: [
    {
      id: "year",
      startDate: "2025-01-01",
      date: "2025-12-31",
      openingValue: 1000,
      closingValue: 1100,
      contributions: 0,
      withdrawals: 0,
      factor: 1.1,
    },
    {
      id: "second",
      startDate: "2026-01-01",
      date: "2026-12-31",
      openingValue: 1100,
      closingValue: 2310,
      contributions: 1000,
      withdrawals: 0,
      factor: 1.1,
    },
  ],
  cashFlows: [
    {
      id: "deposit",
      date: "2026-01-01",
      amount: 1000,
      transactionId: "deposit-transaction",
      description: "Additional Investment",
    },
  ],
};
const meta = {
  title: "Components/AccountReturns",
  component: AccountReturnSummaryView,
  args: { data, loading: false, onRetry: fn(), onViewCalculation: fn() },
} satisfies Meta<typeof AccountReturnSummaryView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Summary: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("account-return-twr")).toHaveTextContent(
      "21.00%",
    );
    await expect(canvas.getByTestId("account-return-mwr")).toHaveTextContent(
      "21.00%",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "View Return Calculation" }),
    );
    await expect(args.onViewCalculation).toHaveBeenCalled();
  },
};
export const Loading: Story = { args: { data: undefined, loading: true } };
export const RequestFailure: Story = {
  args: {
    data: undefined,
    error: "Returns could not be loaded. Please try again.",
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Retry" }),
    );
    await expect(args.onRetry).toHaveBeenCalled();
  },
};
export const AmbiguousMwr: Story = {
  args: {
    data: {
      ...data,
      mwr: null,
      annualizedMwr: null,
      diagnostics: [
        {
          metric: "mwr",
          message:
            "Multiple money-weighted returns are possible for these cash flows.",
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("account-return-twr")).toHaveTextContent(
      "21.00%",
    );
    await expect(canvas.getByTestId("account-return-mwr")).toHaveTextContent(
      "—",
    );
    await userEvent.hover(canvas.getByTestId("account-return-mwr"));
    await expect(
      await within(document.body).findByRole("tooltip"),
    ).toHaveTextContent("Multiple money-weighted");
  },
};
export const NegativeCapital: Story = {
  args: {
    data: {
      ...data,
      twr: null,
      mwr: null,
      annualizedTwr: null,
      annualizedMwr: null,
      diagnostics: [
        {
          metric: "both",
          message:
            "Returns are unavailable when invested value becomes negative.",
        },
      ],
    },
  },
};
export const SwissLocale: Story = {
  decorators: [
    (Story) => (
      <UserLocaleProvider locale="de-CH">
        <Story />
      </UserLocaleProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTestId("account-return-twr"),
    ).toHaveTextContent(
      new Intl.NumberFormat("de-CH", {
        style: "percent",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(0.21),
    );
  },
};
const openTransaction = fn();
export const Calculation: Story = {
  render: () => (
    <ReturnCalculation data={data} onOpenTransaction={openTransaction} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByTestId("account-return-annualized-twr"),
    ).toHaveTextContent("10.00%");
    await expect(
      canvas.getByRole("heading", { name: "Valuations and TWR Factors" }),
    ).toBeVisible();
    await userEvent.click(
      await canvas.findByRole("button", { name: "Open Transaction" }),
    );
    await expect(openTransaction).toHaveBeenCalledWith(
      "deposit-transaction",
      "2026-01-01",
    );
  },
};

const selected = fn();
function ReturnGridExample({
  loading = false,
  completedIds,
  unavailable = false,
}: {
  loading?: boolean;
  completedIds?: Set<string>;
  unavailable?: boolean;
}) {
  const grid = useRef<GridApi | null>(null);
  useEffect(() => {
    grid.current?.refreshCells({
      columns: ["return-twr", "return-mwr"],
      force: true,
    });
  }, [loading, completedIds]);
  const [target, setTarget] = useState<AccountReturnTarget>();
  const summary: AccountReturnSummaries = {
    referenceCurrency: "CHF",
    startDate: data.startDate,
    asOfDate: data.asOfDate,
    rows: [
      { id: "a", ...data, ...(unavailable ? { twr: null, mwr: null } : {}) },
      { id: "group", ...data },
    ],
    total: data,
  };
  const columns = buildAccountReturnColumns({
    data: summary,
    loading,
    completedIds,
    locale: "en-US",
    onOpen: (item) => {
      selected(item);
      setTarget(item);
    },
  });
  return (
    <>
      <DataGrid
        onGridReady={(event) => {
          grid.current = event.api;
        }}
        containerStyle={{ height: 270 }}
        columnDefs={[{ field: "name" }, columns]}
        rowData={[
          { id: "a", name: "Investment Account", nodeType: "account" },
          { id: "group", name: "Group", nodeType: "accountGroup" },
        ]}
        pinnedBottomRowData={[
          {
            id: "footer",
            rowType: "referenceCurrencyTotalFooter",
            name: "Total",
          },
        ]}
      />
      <Drawer
        opened={!!target}
        onClose={() => setTarget(undefined)}
        title="Return Calculation"
        size="90%"
        position="right"
      >
        <ReturnCalculation data={data} />
      </Drawer>
    </>
  );
}
export const AccountAndGroupGrid: Story = {
  render: () => <ReturnGridExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: /View TWR calculation for Group/,
      }),
    );
    await expect(selected).toHaveBeenCalledWith({ kind: "group", id: "group" });
    await waitFor(async () =>
      expect(
        await within(document.body).findByRole("dialog", {
          name: "Return Calculation",
        }),
      ).toBeVisible(),
    );
  },
};

export const GridLoading: Story = {
  render: () => <ReturnGridExample loading />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const indicators = await canvas.findAllByRole("status", {
      name: "Loading TWR",
    });
    await expect(indicators).toHaveLength(3);
    for (const indicator of indicators) {
      await expect(indicator).toHaveStyle({
        justifyContent: "flex-end",
        alignItems: "center",
      });
      await expect(
        indicator.querySelector(".mantine-Loader-root")?.children,
      ).toHaveLength(3);
    }
    await expect(
      canvas.getAllByRole("status", { name: "Loading MWR" }),
    ).toHaveLength(3);
  },
};

function GridLoadingCompletion() {
  const [loading, setLoading] = useState(true);
  return (
    <>
      <Button onClick={() => setLoading(false)}>Complete Loading</Button>
      <ReturnGridExample loading={loading} />
    </>
  );
}
export const GridLoadingCompletes: Story = {
  render: () => <GridLoadingCompletion />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findAllByRole("status", { name: "Loading TWR" });
    await userEvent.click(
      canvas.getByRole("button", { name: "Complete Loading" }),
    );
    await expect(
      await canvas.findByRole("button", {
        name: /View TWR calculation for Investment Account: 21.00%/,
      }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("status", { name: "Loading TWR" }),
    ).not.toBeInTheDocument();
  },
};

function ProgressiveGridExample() {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  return (
    <>
      <Button onClick={() => setCompleted(new Set(["a"]))}>
        Complete Account
      </Button>
      <Button
        onClick={() =>
          setCompleted(new Set(["a", "group", "__return_total__"]))
        }
      >
        Complete All
      </Button>
      <ReturnGridExample loading completedIds={completed} unavailable />
    </>
  );
}
export const ProgressiveUnavailableRows: Story = {
  render: () => <ProgressiveGridExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findAllByRole("status", { name: "Loading TWR" });
    await userEvent.click(
      canvas.getByRole("button", { name: "Complete Account" }),
    );
    await expect(
      await canvas.findByRole("button", {
        name: /View TWR calculation for Investment Account:/,
      }),
    ).toHaveTextContent("—");
    await expect(
      canvas.getAllByRole("status", { name: "Loading TWR" }),
    ).toHaveLength(2);
    await userEvent.click(canvas.getByRole("button", { name: "Complete All" }));
    await expect(
      canvas.queryByRole("status", { name: "Loading TWR" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("status", { name: "Loading MWR" }),
    ).not.toBeInTheDocument();
  },
};

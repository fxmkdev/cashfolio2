import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ColDef } from "ag-grid-enterprise";
import { Box } from "@mantine/core";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  FORMATTED_NUMERIC_COLUMN,
  TEXT_COLUMN,
  DATE_COLUMN,
} from "./column-types";
import { DataGrid } from "./data-grid";

type Row = {
  id: string;
  date: Date;
  description: string;
  amount: number;
};

const rows: Row[] = [
  {
    id: "row-1",
    date: new Date("2026-01-10"),
    description: "Coffee",
    amount: 5.4,
  },
  {
    id: "row-2",
    date: new Date("2026-01-12"),
    description: "Groceries",
    amount: 82.1,
  },
];

const columns: ColDef<Row>[] = [
  {
    headerName: "Date",
    field: "date",
    type: DATE_COLUMN,
    editable: true,
    width: 160,
  },
  {
    headerName: "Description",
    field: "description",
    type: TEXT_COLUMN,
    editable: true,
    flex: 1,
  },
  {
    headerName: "Amount",
    field: "amount",
    type: FORMATTED_NUMERIC_COLUMN,
    editable: true,
    width: 160,
  },
];

const meta = {
  title: "Components/DataGrid",
  component: DataGrid,
  render: () => (
    <Box h={280}>
      <DataGrid
        rowData={rows}
        columnDefs={columns}
        getRowId={({ data }) => data.id}
        rowSelection="single"
      />
    </Box>
  ),
} satisfies Meta<typeof DataGrid>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// A long, wide grid exercises v36's unified scroll viewport and pinned cells.
export const ScrollingAndPinnedCells: Story = {
  render: () => (
    <Box h={280} w="100%">
      <DataGrid
        rowData={Array.from({ length: 80 }, (_, index) => ({
          id: `scroll-${index}`,
          date: new Date("2026-01-10"),
          description: `Booking ${index}`,
          amount: index,
        }))}
        columnDefs={[
          { ...columns[0], width: 110, pinned: "left" },
          { ...columns[1], flex: undefined, width: 1000 },
          { ...columns[2], width: 110, pinned: "right" },
        ]}
        getRowId={({ data }) => data.id}
        rowSelection={{ mode: "multiRow" }}
        pinnedBottomRowData={[
          { id: "total", description: "Total", amount: 3160 },
        ]}
      />
    </Box>
  ),
  play: async ({ canvasElement, parameters }) => {
    if (import.meta.env.MODE === "test") {
      const mobile = parameters.viewport?.defaultViewport === "cashfolioMobile";
      await expect(window.innerWidth).toBe(mobile ? 390 : 1280);
      await expect(window.innerHeight).toBe(mobile ? 844 : 900);
    }
    const canvas = within(canvasElement);
    const viewport =
      canvasElement.querySelector<HTMLElement>(".ag-grid-viewport")!;
    await waitFor(() => {
      expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
      expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth);
    });
    const firstRow = canvasElement.querySelector<HTMLElement>(
      '.ag-grid-scrolling-container > .ag-row[row-id="scroll-0"]',
    )!;
    const checkbox = firstRow.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    await userEvent.click(checkbox);
    await waitFor(() =>
      expect(firstRow).toHaveAttribute("aria-selected", "true"),
    );

    const description = firstRow.querySelector<HTMLElement>(
      '[col-id="description"]',
    )!;
    await userEvent.click(description);
    await userEvent.clear(canvas.getByRole("textbox"));
    await userEvent.type(canvas.getByRole("textbox"), "Edited booking{Enter}");
    await waitFor(() =>
      expect(description).toHaveTextContent("Edited booking"),
    );
    await userEvent.click(description);
    await userEvent.clear(canvas.getByRole("textbox"));
    await userEvent.type(canvas.getByRole("textbox"), "Cancelled{Escape}");
    await waitFor(() =>
      expect(description).toHaveTextContent("Edited booking"),
    );
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(
        canvasElement.querySelector(".ag-cell-focus")?.closest(".ag-row"),
      ).toHaveAttribute("row-id", "scroll-1"),
    );

    const pinnedAmount = firstRow.querySelector<HTMLElement>(
      '.ag-grid-pinned-right-cells [col-id="amount"]',
    )!;
    const initialRight = pinnedAmount.getBoundingClientRect().right;
    viewport.scrollLeft = 300;
    await waitFor(() => {
      expect(viewport.scrollLeft).toBeGreaterThan(0);
      expect(pinnedAmount.getBoundingClientRect().right).toBeCloseTo(
        initialRight,
        0,
      );
    });
    viewport.scrollTop = viewport.scrollHeight;
    await waitFor(() => expect(canvas.getByText("Booking 79")).toBeVisible());
    viewport.scrollLeft = 0;
    await waitFor(() => expect(canvas.getByText("Total")).toBeVisible());
  },
};

export const NarrowScrollingGrid: Story = {
  ...ScrollingAndPinnedCells,
  parameters: {
    viewport: { defaultViewport: "cashfolioMobile" },
  },
};

export const Empty: Story = {
  render: () => (
    <Box h={280}>
      <DataGrid rowData={[]} columnDefs={columns} />
    </Box>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("No Rows To Show"),
    ).toBeVisible();
  },
};

export const Loading: Story = {
  render: () => (
    <Box h={280}>
      <DataGrid loading columnDefs={columns} />
    </Box>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("Loading..."),
    ).toBeVisible();
  },
};

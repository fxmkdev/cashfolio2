import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ColDef } from "ag-grid-enterprise";
import { Box } from "@mantine/core";
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

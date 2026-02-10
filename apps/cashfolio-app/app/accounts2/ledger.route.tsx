import { Badge, Button, Group, Modal, Stack, Text, Title } from "@mantine/core";
import { DATE_COLUMN, FORMATTED_NUMERIC_COLUMN } from "./column-types";
import { DataGrid } from "./data-grid";
import { IconCashPlus } from "@tabler/icons-react";
import { useState } from "react";
import { SplitTransaction } from "./split-transaction";
import { Unit } from "~/.prisma-client/enums";

export default function LedgerRoute({
  name,
  unit,
  currency,
  data,
}: {
  name: string;
  unit: Unit;
  currency?: string;
  data: {
    date: string;
    accounts: { id: string; name: string }[];
    bookings: {
      date: string;
      account: string;
      description: string;
      unit: Unit;
      currency: string;
      debit?: number;
      credit?: number;
    }[];
    description: string;
    debit?: number;
    credit?: number;
    balance?: number;
  }[];
}) {
  const [opened, setOpened] = useState(false);
  const [deleteOpened, setDeleteOpened] = useState(false);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  return (
    <Stack>
      <Group justify="space-between">
        <Group>
          <Title order={2} size="h3">
            {name}
          </Title>
          <Badge size="lg" color="gray">
            {unit === Unit.CURRENCY ? currency : null}
          </Badge>
        </Group>
        <Button
          variant="default"
          leftSection={<IconCashPlus size={16} />}
          onClick={() => {
            setOpened(true);
            setSelectedRowIndex(null);
          }}
        >
          New Transaction
        </Button>
      </Group>

      <Modal
        title="Delete transaction"
        opened={deleteOpened}
        onClose={() => setDeleteOpened(false)}
      >
        <Text size="sm">Do you really want to delete this transaction?</Text>

        <Group mt="lg" justify="end">
          <Button variant="subtle" onClick={() => setDeleteOpened(false)}>
            Cancel
          </Button>
          <Button
            variant="filled"
            color="red"
            onClick={() => setDeleteOpened(false)}
          >
            Delete
          </Button>
        </Group>
      </Modal>

      <Modal
        size="100%"
        opened={opened}
        onClose={() => setOpened(false)}
        title={
          selectedRowIndex != null ? "Edit Transaction" : "New Transaction"
        }
      >
        <SplitTransaction
          initialValues={
            selectedRowIndex != null
              ? {
                  description: data[selectedRowIndex].description,
                  bookings: data[selectedRowIndex].bookings,
                }
              : undefined
          }
          onDeleteTransaction={
            selectedRowIndex != null
              ? () => {
                  setOpened(false);
                  setDeleteOpened(true);
                }
              : undefined
          }
        />
      </Modal>
      <DataGrid
        onRowDoubleClicked={(e) => {
          setOpened(true);
          setSelectedRowIndex(e.rowIndex);
        }}
        columnDefs={[
          {
            field: "date",
            type: DATE_COLUMN,
            cellDataType: "dateString",
            width: 130,
          },
          {
            field: "accounts",
            valueFormatter: ({ value }) =>
              value.map((a: any) => a.name).join(", "),
            minWidth: 300,
            flex: 1,
          },
          {
            field: "description",
            width: 150,
          },
          {
            field: "debitFx",
            headerName: "Debit (FX)",
            type: FORMATTED_NUMERIC_COLUMN,
            width: 150,
          },
          {
            field: "creditFx",
            headerName: "Credit (FX)",
            type: FORMATTED_NUMERIC_COLUMN,
            width: 150,
          },
          {
            field: "debit",
            type: FORMATTED_NUMERIC_COLUMN,
            width: 150,
          },
          {
            field: "credit",
            type: FORMATTED_NUMERIC_COLUMN,
            width: 150,
          },
          {
            field: "balance",
            type: FORMATTED_NUMERIC_COLUMN,
            width: 150,
          },
        ]}
        rowData={data}
        domLayout="autoHeight"
        defaultColDef={{
          sortable: false,
          suppressHeaderMenuButton: true,
        }}
      />
    </Stack>
  );
}

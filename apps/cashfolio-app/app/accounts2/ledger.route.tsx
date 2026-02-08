import { Button, Group, Modal, Stack } from "@mantine/core";
import { DATE_COLUMN, FORMATTED_NUMERIC_COLUMN } from "./column-types";
import { DataGrid } from "./data-grid";
import { IconCashPlus } from "@tabler/icons-react";
import { useState } from "react";
import { SplitTransaction } from "./split-transaction";
import { createId } from "@paralleldrive/cuid2";
import { Unit } from "~/.prisma-client/enums";

function NewTransactionButton() {
  const [opened, setOpened] = useState(false);

  return (
    <>
      <Button
        variant="default"
        leftSection={<IconCashPlus size={16} />}
        onClick={() => setOpened(true)}
      >
        New Transaction
      </Button>
      <Modal
        size="100%"
        opened={opened}
        onClose={() => setOpened(false)}
        title="New Transaction"
      >
        <SplitTransaction
          bookings={[
            {
              key: createId(),
              date: "2024-01-01",
              account: "account-1",
              description: "Grocery Store",
              unit: Unit.CURRENCY,
              currency: "CHF",
              debit: 50,
            },
            {
              key: createId(),
              date: "2024-01-01",
              account: "account-2",
              description: "Checking Account",
              unit: Unit.CURRENCY,
              currency: "CHF",
              credit: 50,
            },
          ]}
        />
      </Modal>
    </>
  );
}

export default function LedgerRoute() {
  return (
    <Stack>
      <Group justify="end">
        <NewTransactionButton />
      </Group>
      <DataGrid
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
        rowData={[
          {
            date: "2024-01-03",
            accounts: [
              {
                id: "account-1",
                name: "Grocery Store",
              },
            ],
            description: "Grocery shopping",
            credit: 200,
            balance: 16_800,
          },
          {
            date: "2024-01-02",
            accounts: [
              {
                id: "account-1",
                name: "Salary",
              },
            ],
            description: "Monthly salary",
            debit: 5000,
            balance: 17_000,
          },
          {
            date: "",
            accounts: [],
            description: "Opening balance",
            balance: 12000,
          },
        ]}
        domLayout="autoHeight"
        defaultColDef={{
          sortable: false,
          suppressHeaderMenuButton: true,
        }}
      />
    </Stack>
  );
}

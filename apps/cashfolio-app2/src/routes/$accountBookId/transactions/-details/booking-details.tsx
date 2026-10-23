import { DataGrid } from "@/components/grid/data-grid";
import { SplitButton } from "@/components/controls/split-button";
import { Box, Button, Flex, Stack, Text, Title, Tooltip } from "@mantine/core";
import { IconCopy, IconPencil, IconTrash } from "@tabler/icons-react";
import { OPENING_BALANCES_MANAGEMENT_MESSAGE } from "@/shared/opening-balances";
import type { ColumnState, GridApi } from "ag-grid-enterprise";
import type { AgGridReactProps } from "ag-grid-react";
import { useEffect, useRef, type RefObject } from "react";
import type { TransactionsBookingRow, TransactionsRow } from "../-page-types";
import classes from "./details.module.css";

const DEFAULT_COL_DEF = {
  sortable: false,
  suppressHeaderMenuButton: true,
  wrapHeaderText: true,
  autoHeaderHeight: true,
  tooltip: true,
};

export type TransactionActions = {
  onEditClick: (transactionId: string) => void;
  onCopyClick: (transactionId: string) => void;
  onDeleteClick: (transactionId: string, description: string) => void;
};

export type BookingDetailsProps = TransactionActions & {
  transaction: TransactionsRow;
  columnDefs: NonNullable<
    AgGridReactProps<TransactionsBookingRow>["columnDefs"]
  >;
  columnState: RefObject<ColumnState[] | undefined>;
  headingRef: RefObject<HTMLHeadingElement | null>;
  panelId: string;
  onClose: () => void;
};

export function BookingDetails({
  transaction,
  columnDefs,
  columnState,
  headingRef,
  panelId,
  onClose,
  onEditClick,
  onCopyClick,
  onDeleteClick,
}: BookingDetailsProps) {
  const apiRef = useRef<GridApi<TransactionsBookingRow> | null>(null);
  const previousTransactionId = useRef(transaction.id);
  const actionsRef = useRef<HTMLDivElement>(null);
  const heading = `Transaction details: ${transaction.description || "Untitled transaction"}`;

  function openMenuAction(action: () => void) {
    if (transaction.isOpeningBalancesTransaction) return;
    // Menu items unmount on activation. Give mutation dialogs a stable opener
    // and let the mobile drawer resume at that control after they close.
    actionsRef.current
      ?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')
      ?.focus();
    action();
  }

  useEffect(() => {
    if (previousTransactionId.current === transaction.id) return;
    previousTransactionId.current = transaction.id;
    apiRef.current?.setFilterModel(null);
    apiRef.current?.ensureColumnVisible("date", "start");
    if (transaction.bookings.length)
      apiRef.current?.ensureIndexVisible(0, "top");
  }, [transaction.id, transaction.bookings.length]);

  return (
    <Flex
      component="section"
      id={panelId}
      aria-labelledby={`${panelId}-heading`}
      className={classes.panel}
      h="100%"
      flex={1}
      direction="column"
      mih={0}
      miw={0}
      w="100%"
      onFocusCapture={(event) => {
        // Mantine reactivates the drawer's focus trap after a child dialog.
        // Resume at the last panel control instead of the initial heading.
        if (!event.currentTarget.contains(event.target)) return;
        event.currentTarget
          .querySelectorAll("[data-autofocus]")
          .forEach((element) => element.removeAttribute("data-autofocus"));
        event.target.setAttribute("data-autofocus", "true");
      }}
    >
      <Box className={classes.header}>
        <Stack gap={2} miw={0} flex={1}>
          <Title
            order={3}
            size="h5"
            id={`${panelId}-heading`}
            ref={headingRef}
            tabIndex={-1}
            className={classes.heading}
            lineClamp={2}
            title={heading}
            data-autofocus
          >
            {heading}
          </Title>
          <Text size="sm" c="dimmed">
            {transaction.date}
            {" · "}
            {transaction.bookings.length}{" "}
            {transaction.bookings.length === 1 ? "booking" : "bookings"}
          </Text>
        </Stack>
        <Box className={classes.actions} ref={actionsRef}>
          <Tooltip
            label={OPENING_BALANCES_MANAGEMENT_MESSAGE}
            disabled={!transaction.isOpeningBalancesTransaction}
          >
            <Box component="span" display="inline-flex">
              <SplitButton
                variant="default"
                leftSection={<IconPencil size={16} />}
                menuLabel="Transaction actions"
                primaryDisabled={transaction.isOpeningBalancesTransaction}
                onClick={() => {
                  if (!transaction.isOpeningBalancesTransaction)
                    onEditClick(transaction.transactionId);
                }}
                menuItems={[
                  {
                    key: "copy",
                    label: "Copy",
                    leftSection: <IconCopy size={16} />,
                    disabled: transaction.isOpeningBalancesTransaction,
                    disabledReason: OPENING_BALANCES_MANAGEMENT_MESSAGE,
                    onClick: () =>
                      openMenuAction(() =>
                        onCopyClick(transaction.transactionId),
                      ),
                  },
                  { type: "divider", key: "danger-actions-divider" },
                  {
                    key: "delete",
                    label: "Delete",
                    color: "red",
                    leftSection: <IconTrash size={16} />,
                    disabled: transaction.isOpeningBalancesTransaction,
                    disabledReason: OPENING_BALANCES_MANAGEMENT_MESSAGE,
                    onClick: () =>
                      openMenuAction(() =>
                        onDeleteClick(
                          transaction.transactionId,
                          transaction.description,
                        ),
                      ),
                  },
                ]}
              >
                Edit
              </SplitButton>
            </Box>
          </Tooltip>
        </Box>
        <Button
          className={classes.closeButton}
          flex="0 0 auto"
          variant="subtle"
          size="sm"
          color="gray"
          c="var(--mantine-color-text)"
          aria-label="Close transaction details"
          onClick={onClose}
        >
          Close
        </Button>
      </Box>
      <DataGrid
        containerStyle={{ flex: 1, minHeight: 0 }}
        rowData={transaction.bookings}
        columnDefs={columnDefs}
        defaultColDef={DEFAULT_COL_DEF}
        getRowId={({ data }: { data: TransactionsBookingRow }) => data.id}
        ensureDomOrder
        suppressColumnVirtualisation
        onGridReady={({ api }) => {
          api.setGridAriaProperty("label", "Transaction bookings");
          apiRef.current = api;
          if (columnState.current)
            api.applyColumnState({ state: columnState.current });
        }}
        onGridPreDestroyed={({ api }) => {
          columnState.current = api.getColumnState();
          apiRef.current = null;
        }}
      />
    </Flex>
  );
}

import { ActionIcon, Group, Tooltip } from "@mantine/core";
import {
  IconCopy,
  IconPencil,
  IconSquareArrowRight,
  IconTrash,
} from "@tabler/icons-react";
import { RowActionsMenu } from "@/components/grid/row-actions-menu";
import { OPENING_BALANCES_MANAGEMENT_MESSAGE } from "@/shared/accounts/opening-balances";
import type { LedgerRow } from "./page-types";
import type { useLedgerColumnDefs } from "./page-columns";

export type LedgerActionsCellProps = Pick<
  Parameters<typeof useLedgerColumnDefs>[0],
  "onEditClick" | "onCopyClick" | "onRebookClick" | "onDeleteClick"
> & { row: LedgerRow };

export function LedgerActionsCell({
  row,
  onEditClick,
  onCopyClick,
  onRebookClick,
  onDeleteClick,
}: LedgerActionsCellProps) {
  if (row.isVirtualCarryOver) return null;
  const disabled = row.isOpeningBalancesTransaction;
  const disabledReason = disabled
    ? OPENING_BALANCES_MANAGEMENT_MESSAGE
    : undefined;
  return (
    <Group gap={4} wrap="nowrap" h="100%" align="center">
      <Tooltip label={disabledReason ?? "Edit"}>
        <span style={{ display: "inline-flex" }}>
          <ActionIcon
            variant="subtle"
            size="sm"
            disabled={disabled}
            aria-label="Edit"
            onClick={() => {
              if (!disabled) onEditClick(row.transactionId);
            }}
          >
            <IconPencil size={16} />
          </ActionIcon>
        </span>
      </Tooltip>
      <RowActionsMenu
        rowLabel={row.description}
        actions={[
          {
            id: "copy",
            label: "Copy",
            icon: <IconCopy size={16} />,
            disabled,
            disabledReason,
            onClick: () => onCopyClick(row.transactionId),
          },
          {
            id: "rebook",
            label: "Rebook",
            icon: <IconSquareArrowRight size={16} />,
            disabled,
            disabledReason,
            onClick: () =>
              onRebookClick({
                bookingId: row.id,
                transactionId: row.transactionId,
                bookingValue: row.bookingValue,
                bookingUnit: {
                  unit: row.unit,
                  currency: row.currency,
                  cryptocurrency: row.cryptocurrency,
                  symbol: row.symbol,
                  tradeCurrency: row.tradeCurrency,
                },
              }),
          },
          {
            id: "delete",
            label: "Delete",
            icon: <IconTrash size={16} />,
            color: "red",
            disabled,
            disabledReason,
            separatorBefore: true,
            onClick: () => onDeleteClick(row.transactionId, row.description),
          },
        ]}
      />
    </Group>
  );
}

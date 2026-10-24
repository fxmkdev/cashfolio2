import { AccountType } from "@/.prisma-client/enums";
import { Group, Text, Tooltip } from "@mantine/core";
import { IconArchive } from "@tabler/icons-react";
import type {
  ICellRendererParams,
  SuppressKeyboardEventParams,
} from "ag-grid-enterprise";
import { isVirtualArchivedGroup } from "./-archived-grid-rows";
import type { AccountsGridRow } from "./-page-types";

export const ARCHIVED_GROUP_DESCRIPTION =
  "Archived items grouped automatically. Included in totals.";

export const ARCHIVED_CATEGORY_GROUP_DESCRIPTION =
  "Archived categories grouped automatically. Their transaction history is preserved.";

export function suppressAccountNameKeyboardEvent({
  event,
  data,
}: SuppressKeyboardEventParams<AccountsGridRow>): boolean {
  if (
    !isVirtualArchivedGroup(data) ||
    event.key !== "Tab" ||
    !(event.target instanceof HTMLElement)
  )
    return false;
  const cell = event.target.closest<HTMLElement>(".ag-cell");
  const label = cell?.querySelector<HTMLElement>(
    "[data-virtual-archived-label]",
  );
  if (!cell || !label) return false;
  if (event.target === cell && !event.shiftKey) {
    event.preventDefault();
    label.focus();
    return true;
  }
  if (event.target === label && event.shiftKey) {
    event.preventDefault();
    cell.focus();
    return true;
  }
  return false;
}

export function AccountNameCell({
  data,
  value,
  valueFormatted,
}: ICellRendererParams<AccountsGridRow, string>) {
  if (!isVirtualArchivedGroup(data))
    return valueFormatted ?? value ?? data?.name ?? null;

  return (
    <Tooltip
      label={
        data && "type" in data && data.type === AccountType.EQUITY
          ? ARCHIVED_CATEGORY_GROUP_DESCRIPTION
          : ARCHIVED_GROUP_DESCRIPTION
      }
      events={{ hover: true, focus: true, touch: true }}
    >
      <Group
        component="span"
        gap={6}
        wrap="nowrap"
        c="dimmed"
        display="inline-flex"
        tabIndex={0}
        data-virtual-archived-label
      >
        <IconArchive size={16} aria-hidden="true" />
        <Text component="span" inherit>
          Archived
        </Text>
      </Group>
    </Tooltip>
  );
}

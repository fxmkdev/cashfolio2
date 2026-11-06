import { ActionIcon, Menu, Tooltip } from "@mantine/core";
import { IconDotsVertical } from "@tabler/icons-react";
import type { ColDef } from "ag-grid-enterprise";
import { useRef, useState } from "react";
import { RowActionMenuItem, type RowAction } from "./row-action-menu-item";

export type { RowAction } from "./row-action-menu-item";

/** Grid events must leave the renderer's buttons and portalled menu in control. */
export const rowActionsColumnProps = {
  headerName: "",
  width: 56,
  minWidth: 56,
  maxWidth: 56,
  sortable: false,
  filter: false,
  resizable: false,
  suppressHeaderMenuButton: true,
  cellClass: "actions-cell",
  cellRendererParams: { suppressMouseEventHandling: () => true },
  suppressKeyboardEvent: ({ event }) => {
    const cell = (event.target as HTMLElement).closest(".ag-cell");
    if (!cell) return false;
    const buttons = Array.from(
      cell.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    );
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (event.key === "Tab") {
      const next = event.shiftKey ? index - 1 : index + 1;
      if (next >= 0 && next < buttons.length) {
        event.preventDefault();
        buttons[next].focus();
        return true;
      }
    }
    if ((event.key === "Enter" || event.key === " ") && index === -1) {
      if (!buttons[0]) return false;
      event.preventDefault();
      buttons[0].focus();
      buttons[0].click();
      return true;
    }
    return index !== -1 && event.key !== "Tab";
  },
} satisfies ColDef;

export function RowActionsMenu({
  rowLabel,
  actions,
}: {
  rowLabel: string;
  actions: readonly RowAction[];
}) {
  const [opened, setOpened] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  return (
    <Menu
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      shadow="md"
      width={260}
      withinPortal
      returnFocus={false}
      onExitTransitionEnd={() => {
        // Dialog actions may have moved focus while the dropdown was closing.
        const active = document.activeElement;
        if (active === document.body || dropdownRef.current?.contains(active)) {
          triggerRef.current?.focus({ preventScroll: true });
        }
      }}
    >
      <Menu.Target>
        <Tooltip label="More Actions" disabled={opened}>
          <ActionIcon
            ref={triggerRef}
            variant="subtle"
            size="sm"
            aria-label={`More Actions for ${rowLabel}`}
            data-row-actions-trigger
            data-row-actions-open={opened || undefined}
          >
            <IconDotsVertical size={16} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown
        ref={dropdownRef}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {actions.map((action) => (
          <RowActionMenuItem
            key={action.id}
            action={action}
            onSelect={() => {
              // Let dialogs capture a return target that survives menu exit.
              triggerRef.current?.focus({ preventScroll: true });
              action.onClick();
            }}
          />
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

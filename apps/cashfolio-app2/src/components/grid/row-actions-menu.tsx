import { ActionIcon, Menu, Tooltip, VisuallyHidden } from "@mantine/core";
import { IconDotsVertical } from "@tabler/icons-react";
import type { ColDef } from "ag-grid-enterprise";
import { Fragment, useId, useRef, useState, type ReactNode } from "react";
import classes from "./row-actions-menu.module.css";

export type RowAction = {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  color?: string;
  disabled?: boolean;
  disabledReason?: string;
  separatorBefore?: boolean;
};

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
  const id = useId();
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
          <Fragment key={action.id}>
            {action.separatorBefore && <Menu.Divider />}
            <Tooltip
              label={action.disabledReason}
              disabled={!action.disabled || !action.disabledReason}
              events={{ hover: true, focus: true, touch: false }}
              multiline
              maw={300}
              position="left"
              withinPortal
            >
              <Menu.Item
                aria-label={action.label}
                aria-disabled={action.disabled || undefined}
                aria-describedby={
                  action.disabled && action.disabledReason
                    ? `${id}-${action.id}`
                    : undefined
                }
                className={classes.item}
                leftSection={action.icon}
                color={action.color}
                closeMenuOnClick={!action.disabled}
                onClick={() => {
                  if (!action.disabled) action.onClick();
                }}
              >
                {action.label}
              </Menu.Item>
            </Tooltip>
            {action.disabled && action.disabledReason && (
              <VisuallyHidden id={`${id}-${action.id}`}>
                {action.disabledReason}
              </VisuallyHidden>
            )}
          </Fragment>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

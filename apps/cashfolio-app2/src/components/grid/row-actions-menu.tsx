import { ActionIcon, Menu, Stack, Text, Tooltip } from "@mantine/core";
import { IconDotsVertical } from "@tabler/icons-react";
import type { ColDef } from "ag-grid-enterprise";
import { Fragment, useId, useRef, useState, type ReactNode } from "react";

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
            size={32}
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
            <Menu.Item
              aria-label={action.label}
              aria-describedby={
                action.disabled && action.disabledReason
                  ? `${id}-${action.id}`
                  : undefined
              }
              leftSection={action.icon}
              color={action.color}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              <Stack gap={2}>
                <span>{action.label}</span>
                {action.disabled && action.disabledReason && (
                  <Text component="span" size="xs" id={`${id}-${action.id}`}>
                    {action.disabledReason}
                  </Text>
                )}
              </Stack>
            </Menu.Item>
          </Fragment>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

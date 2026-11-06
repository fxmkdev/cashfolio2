import { Menu, Tooltip, VisuallyHidden } from "@mantine/core";
import { useId, type ReactNode } from "react";
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

export function RowActionMenuItem({
  action,
  onSelect,
}: {
  action: RowAction;
  onSelect: () => void;
}) {
  const descriptionId = useId();
  const reason = action.disabled ? action.disabledReason : undefined;
  return (
    <>
      {action.separatorBefore && <Menu.Divider />}
      <Tooltip
        label={reason}
        disabled={!reason}
        events={{ hover: true, focus: true, touch: false }}
        multiline
        maw={300}
        position="left"
        withinPortal
      >
        <Menu.Item
          aria-label={action.label}
          aria-disabled={action.disabled || undefined}
          aria-describedby={reason ? descriptionId : undefined}
          className={classes.item}
          leftSection={action.icon}
          color={action.color}
          closeMenuOnClick={!action.disabled}
          onClick={() => {
            if (!action.disabled) onSelect();
          }}
        >
          {action.label}
        </Menu.Item>
      </Tooltip>
      {reason && <VisuallyHidden id={descriptionId}>{reason}</VisuallyHidden>}
    </>
  );
}

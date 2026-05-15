import {
  Button,
  type ButtonProps,
  type MantineColor,
  Menu,
  Tooltip,
} from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { Fragment, type ComponentPropsWithoutRef, type ReactNode } from "react";

export function SplitButtonGroup(
  props: ComponentPropsWithoutRef<typeof Button.Group>,
) {
  return <Button.Group {...props} />;
}

export type SplitButtonMenuItem = {
  key: string;
  label: string;
  disabledReason?: string;
  leftSection?: ReactNode;
  color?: MantineColor;
  disabled?: boolean;
  onClick: () => void;
};

export function SplitButton({
  children,
  leftSection,
  menuLabel = "More actions",
  menuItems,
  onClick,
  variant = "default",
  primaryDisabled = false,
}: {
  children: ReactNode;
  leftSection?: ReactNode;
  menuLabel?: string;
  menuItems: SplitButtonMenuItem[];
  onClick: () => void;
  variant?: ButtonProps["variant"];
  primaryDisabled?: boolean;
}) {
  return (
    <SplitButtonGroup>
      <Button
        variant={variant}
        leftSection={leftSection}
        onClick={onClick}
        disabled={primaryDisabled}
      >
        {children}
      </Button>
      <Menu position="bottom-end" shadow="md" width={220}>
        <Menu.Target>
          <Button variant={variant} px="xs" aria-label={menuLabel}>
            <IconChevronDown size={16} />
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {menuItems.map((item) => {
            const menuItem = (
              <Menu.Item
                color={item.color}
                disabled={item.disabled}
                leftSection={item.leftSection}
                onClick={item.onClick}
              >
                {item.label}
              </Menu.Item>
            );

            if (!item.disabled || !item.disabledReason) {
              return <Fragment key={item.key}>{menuItem}</Fragment>;
            }

            return (
              <Tooltip
                key={item.key}
                label={item.disabledReason}
                position="left"
                multiline
              >
                <span style={{ display: "block" }}>{menuItem}</span>
              </Tooltip>
            );
          })}
        </Menu.Dropdown>
      </Menu>
    </SplitButtonGroup>
  );
}

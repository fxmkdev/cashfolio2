import { Button, Menu } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import type { ReactNode } from "react";

export type SplitButtonMenuItem = {
  label: string;
  disabledLabel?: string;
  leftSection?: ReactNode;
  color?: string;
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
  disabled = false,
}: {
  children: ReactNode;
  leftSection?: ReactNode;
  menuLabel?: string;
  menuItems: SplitButtonMenuItem[];
  onClick: () => void;
  variant?: string;
  disabled?: boolean;
}) {
  return (
    <Button.Group>
      <Button
        variant={variant}
        leftSection={leftSection}
        onClick={onClick}
        disabled={disabled}
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
          {menuItems.map((item) => (
            <Menu.Item
              key={item.label}
              color={item.color}
              disabled={item.disabled}
              leftSection={item.leftSection}
              onClick={item.onClick}
            >
              {item.disabled ? (item.disabledLabel ?? item.label) : item.label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Button.Group>
  );
}

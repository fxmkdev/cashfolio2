import { Group } from "@mantine/core";
import type { ReactNode } from "react";

export type TopPageHeaderProps = {
  heading: ReactNode;
  headingAccessory?: ReactNode;
  actions?: ReactNode;
};

export function TopPageHeader({
  heading,
  headingAccessory,
  actions,
}: TopPageHeaderProps) {
  return (
    <Group mb="lg" justify="space-between" align="center" mih={36}>
      <Group gap="md" align="center">
        {heading}
        {headingAccessory}
      </Group>
      {actions}
    </Group>
  );
}

import { Box, Group, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./top-page-header.module.css";

export type TopPageHeaderProps = {
  heading: ReactNode;
  headingAccessory?: ReactNode;
  actions?: ReactNode;
  description?: ReactNode;
  layout?: "default" | "responsive";
};

export function TopPageHeader({
  heading,
  headingAccessory,
  actions,
  description,
  layout = "default",
}: TopPageHeaderProps) {
  const headingContent = (
    <Group
      gap="md"
      align="center"
      className={layout === "responsive" ? classes.heading : undefined}
    >
      {heading}
      {headingAccessory}
    </Group>
  );

  if (layout === "responsive") {
    return (
      <Box mb="lg" mih={36} flex="0 0 auto" className={classes.container}>
        <div className={classes.layout}>
          <Stack gap={4} className={classes.identity}>
            {headingContent}
            {description}
          </Stack>
          {actions && <div className={classes.actions}>{actions}</div>}
        </div>
      </Box>
    );
  }

  return (
    <Group
      mb="lg"
      justify="space-between"
      align="center"
      mih={36}
      flex="0 0 auto"
    >
      {description ? (
        <Stack gap={4}>
          {headingContent}
          {description}
        </Stack>
      ) : (
        headingContent
      )}
      {actions}
    </Group>
  );
}

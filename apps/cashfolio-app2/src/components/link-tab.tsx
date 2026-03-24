import { Tabs, type TabsTabProps } from "@mantine/core";
import { createLink } from "@tanstack/react-router";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

const TabLinkBase = forwardRef<
  HTMLButtonElement,
  TabsTabProps & ComponentPropsWithoutRef<"a">
>(function TabLinkBase(props, ref) {
  return <Tabs.Tab ref={ref} component="a" {...props} />;
});

export const LinkTab = createLink(TabLinkBase);

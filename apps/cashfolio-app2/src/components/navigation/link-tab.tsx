import { Tabs, type TabsTabProps } from "@mantine/core";
import { createLink } from "@tanstack/react-router";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

const TabLinkBase = forwardRef<
  HTMLAnchorElement,
  Omit<TabsTabProps, "component"> & ComponentPropsWithoutRef<"a">
>(function TabLinkBase(props, ref) {
  return <Tabs.Tab ref={ref as never} {...props} component="a" />;
});

export const LinkTab = createLink(TabLinkBase);

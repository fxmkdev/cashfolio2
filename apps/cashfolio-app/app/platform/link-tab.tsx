import {
  Link as RouterLink,
  type LinkProps as RouterLinkProps,
} from "react-router";
import { Tabs, type TabsTabProps } from "@mantine/core";

export function LinkTab(props: TabsTabProps & RouterLinkProps) {
  return <Tabs.Tab component={RouterLink} {...props} />;
}

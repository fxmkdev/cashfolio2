import { Tooltip } from "@mantine/core";
import type { ReactElement } from "react";

export function ExactValueTooltip(args: {
  label?: string;
  children: ReactElement;
}) {
  if (!args.label) {
    return args.children;
  }

  return <Tooltip label={args.label}>{args.children}</Tooltip>;
}

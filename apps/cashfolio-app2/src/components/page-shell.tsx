import { Box, type BoxProps } from "@mantine/core";
import type { CSSProperties, ReactNode } from "react";

const PAGE_SHELL_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  width: "100%",
  minHeight: 0,
};

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export type PageShellProps = Omit<BoxProps, "children" | "style"> & {
  children: ReactNode;
  style?: CSSProperties;
};

export function PageShell({
  children,
  className,
  style,
  ...props
}: PageShellProps) {
  return (
    <Box
      {...props}
      className={joinClassNames(className, "cf-page-shell")}
      style={{ ...PAGE_SHELL_STYLE, ...style }}
    >
      {children}
    </Box>
  );
}

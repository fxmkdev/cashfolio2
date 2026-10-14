import { Container, type ContainerProps } from "@mantine/core";
import type { ReactNode } from "react";
import { PageShell } from "./page-shell";

export type NarrowPageShellProps = Omit<ContainerProps, "children"> & {
  children: ReactNode;
};

export function NarrowPageShell({
  children,
  px = 0,
  size = "xs",
  w = "100%",
  ...props
}: NarrowPageShellProps) {
  return (
    <PageShell>
      <Container {...props} px={px} size={size} w={w}>
        {children}
      </Container>
    </PageShell>
  );
}

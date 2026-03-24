import { Button, type ButtonProps } from "@mantine/core";
import { createLink } from "@tanstack/react-router";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

const ButtonLinkBase = forwardRef<
  HTMLAnchorElement,
  Omit<ButtonProps, "component"> & ComponentPropsWithoutRef<"a">
>(function ButtonLinkBase(props, ref) {
  return <Button ref={ref} {...props} component="a" />;
});

export const LinkButton = createLink(ButtonLinkBase);

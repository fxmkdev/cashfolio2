import { Button, type ButtonProps } from "@mantine/core";
import { createLink } from "@tanstack/react-router";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

const ButtonLinkBase = forwardRef<
  HTMLAnchorElement,
  ButtonProps & ComponentPropsWithoutRef<"a">
>(function ButtonLinkBase(props, ref) {
  return <Button ref={ref} component="a" {...props} />;
});

export const LinkButton = createLink(ButtonLinkBase);

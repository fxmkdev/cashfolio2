import { NavLink, type NavLinkProps } from "@mantine/core";
import { createLink } from "@tanstack/react-router";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

const NavLinkBase = forwardRef<
  HTMLAnchorElement,
  Omit<NavLinkProps, "component"> & ComponentPropsWithoutRef<"a">
>(function NavLinkBase(props, ref) {
  return <NavLink ref={ref} {...props} component="a" />;
});

export const LinkNavLink = createLink(NavLinkBase);

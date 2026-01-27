import clsx from "clsx";
import {
  NavLink as RouterNavLink,
  type NavLinkProps as RouterNavLinkProps,
} from "react-router";
import classes from "./nav-link.module.css";

export function NavLink(props: Omit<RouterNavLinkProps, "className">) {
  return (
    <RouterNavLink
      className={({ isActive }) =>
        clsx(classes.base, isActive && classes.active)
      }
      {...props}
    />
  );
}

import {
  Children,
  isValidElement,
  type ComponentType,
  type ReactNode,
} from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    createLink: (Component: ComponentType<Record<string, unknown>>) =>
      React.forwardRef<
        HTMLAnchorElement,
        {
          search?: Record<string, unknown>;
          to?: string;
          [key: string]: unknown;
        }
      >(function LinkMenuItem({ search, to, ...props }, ref) {
        const searchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(search ?? {})) {
          if (typeof value === "string") {
            searchParams.set(key, value);
          }
        }
        const suffix = searchParams.size ? `?${searchParams.toString()}` : "";
        const href = `${to ?? "#"}${suffix}`;
        return React.createElement(Component, { ...props, href, ref });
      }),
  };
});

import { UserMenuItems } from "../-user-menu";

describe("UserMenuItems", () => {
  it("renders user settings, account security, and sign out entries", () => {
    const menuItems = UserMenuItems({
      accountSecurityUrl: "https://tenant.logto.app/account/security",
      userSettingsReturnTo: "/book-1/accounts?tab=ASSET&mode=active",
    });
    if (!isValidElement<{ children: ReactNode }>(menuItems)) {
      throw new Error("Expected UserMenuItems to return a React element.");
    }

    const children = Children.toArray(menuItems.props.children);
    const [settingsItem, securityItem, , signOutForm] = children;

    expect(settingsItem).toMatchObject({
      props: {
        children: "User Settings",
        preload: false,
        search: { returnTo: "/book-1/accounts?tab=ASSET&mode=active" },
        to: "/user-settings",
      },
    });
    expect(securityItem).toMatchObject({
      props: {
        children: "Account Security",
        href: "https://tenant.logto.app/account/security",
        rel: "noopener noreferrer",
        target: "_blank",
      },
    });
    expect(signOutForm).toMatchObject({
      props: {
        action: "/api/logto/sign-out",
        method: "post",
      },
    });
    if (!isValidElement<{ children: ReactNode }>(signOutForm)) {
      throw new Error("Expected sign out form to be a React element.");
    }

    expect(signOutForm.props.children).toMatchObject({
      props: {
        children: "Sign Out",
        type: "submit",
      },
    });
  });

  it("omits account security when no URL is available", () => {
    const menuItems = UserMenuItems({
      accountSecurityUrl: null,
      userSettingsReturnTo: "/admin",
    });
    if (!isValidElement<{ children: ReactNode }>(menuItems)) {
      throw new Error("Expected UserMenuItems to return a React element.");
    }

    expect(Children.toArray(menuItems.props.children)).not.toContainEqual(
      expect.objectContaining({
        props: expect.objectContaining({
          children: "Account Security",
        }),
      }),
    );
  });
});

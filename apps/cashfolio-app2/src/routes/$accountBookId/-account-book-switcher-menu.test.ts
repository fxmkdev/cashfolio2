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
          params?: { accountBookId?: string };
          to?: string;
          [key: string]: unknown;
        }
      >(function LinkMenuItem({ params, to, ...props }, ref) {
        const accountBookId =
          (params as { accountBookId?: string } | undefined)?.accountBookId ??
          "";
        const href =
          to === "/$accountBookId/user-settings"
            ? `/${accountBookId}/user-settings`
            : (to ?? "#");

        return React.createElement(Component, { ...props, href, ref });
      }),
  };
});

import { UserMenuItems } from "./-account-book-switcher-menu";

describe("UserMenuItems", () => {
  it("renders user settings, account security, and sign out entries", () => {
    const menuItems = UserMenuItems({
      accountBookId: "book-1",
      accountSecurityUrl: "https://tenant.logto.app/account/security",
    });
    if (!isValidElement<{ children: ReactNode }>(menuItems)) {
      throw new Error("Expected UserMenuItems to return a React element.");
    }

    const children = Children.toArray(menuItems.props.children);
    const [settingsItem, securityItem, , signOutForm] = children;

    expect(settingsItem).toMatchObject({
      props: {
        children: "User Settings",
        params: { accountBookId: "book-1" },
        preload: false,
        to: "/$accountBookId/user-settings",
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
      accountBookId: "book-1",
      accountSecurityUrl: null,
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

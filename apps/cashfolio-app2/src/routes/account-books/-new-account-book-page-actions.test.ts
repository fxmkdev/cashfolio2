import { MantineProvider, Menu } from "@mantine/core";
import { createElement, forwardRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  NewAccountBookPageActions,
  NewAccountBookSignOutMenuItem,
  resolveNewAccountBookReturnTarget,
} from "./-new-account-book-page-actions";

vi.mock("@/components/link-button", () => ({
  LinkButton: forwardRef<HTMLAnchorElement, { to: string }>(
    function MockLinkButton({ to, ...props }, ref) {
      return createElement("a", {
        ...props,
        ref,
        href: to,
        "data-router-link": "true",
      });
    },
  ),
}));

const accountBooks = [
  { id: "storybook-book", name: "Storybook Book" },
  { id: "other-book", name: "Other Book" },
];

const userProfile = {
  displayName: "Storybook User",
  avatarUrl: null,
  initials: "SU",
};

describe("resolveNewAccountBookReturnTarget", () => {
  it("resolves same-app paths for accessible account books", () => {
    expect(
      resolveNewAccountBookReturnTarget({
        accountBooks,
        returnTo: "/storybook-book/period?period=2026-01#rows",
      }),
    ).toEqual({
      accountBookName: "Storybook Book",
      href: "/storybook-book/period?period=2026-01#rows",
    });
  });

  it("ignores unsafe external return targets", () => {
    expect(
      resolveNewAccountBookReturnTarget({
        accountBooks,
        returnTo: "https://evil.example/storybook-book/accounts",
      }),
    ).toBeNull();

    expect(
      resolveNewAccountBookReturnTarget({
        accountBooks,
        returnTo: "//evil.example/storybook-book/accounts",
      }),
    ).toBeNull();
  });

  it("ignores inaccessible account book ids", () => {
    expect(
      resolveNewAccountBookReturnTarget({
        accountBooks,
        returnTo: "/missing-book/accounts",
      }),
    ).toBeNull();
  });
});

describe("NewAccountBookPageActions", () => {
  it("renders a user menu trigger without a return target", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MantineProvider,
        null,
        createElement(NewAccountBookPageActions, {
          returnTarget: null,
          userProfile,
        }),
      ),
    );

    expect(markup).toContain("Open user menu, current: Storybook User");
    expect(markup).toContain("SU");
    expect(markup).not.toContain("Back to");
  });

  it("renders the sign-out menu item as a post form", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MantineProvider,
        null,
        createElement(
          Menu,
          { opened: true, withinPortal: false },
          createElement(
            Menu.Target,
            null,
            createElement("button", { type: "button" }, "Open"),
          ),
          createElement(
            Menu.Dropdown,
            null,
            createElement(NewAccountBookSignOutMenuItem),
          ),
        ),
      ),
    );

    expect(markup).toContain('action="/api/logto/sign-out"');
    expect(markup).toContain('method="post"');
    expect(markup).toContain('type="submit"');
    expect(markup).toContain("Sign Out");
  });

  it("renders a back link for a valid return target", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MantineProvider,
        null,
        createElement(NewAccountBookPageActions, {
          returnTarget: {
            accountBookName: "Storybook Book",
            href: "/storybook-book/activity?period=2026-01",
          },
          userProfile,
        }),
      ),
    );

    expect(markup).toContain('href="/storybook-book/activity?period=2026-01"');
    expect(markup).toContain('data-router-link="true"');
    expect(markup).toContain("Back to Storybook Book");
    expect(markup).not.toContain('action="/api/logto/sign-out"');
  });
});

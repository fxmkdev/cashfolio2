import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/components/link-nav-link", () => ({
  LinkNavLink: ({
    label,
    to,
  }: {
    label: string;
    to: string;
    leftSection?: ReactNode;
    onClick?: () => void;
  }) => createElement("a", { href: to }, label),
}));

vi.mock("../-user-menu", () => ({
  UserMenu: () => createElement("button", null, "User"),
}));

import { AdminShell } from "./-admin-shell";

describe("AdminShell", () => {
  test("includes the Provider Usage navigation link", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MantineProvider,
        null,
        createElement(AdminShell, {
          accountSecurityUrl: null,
          appVersion: "test",
          children: createElement("main", null, "Admin content"),
          userProfile: {
            displayName: "Test User",
            avatarUrl: null,
            initials: "TU",
          },
        }),
      ),
    );

    expect(markup).toContain("Overview");
    expect(markup).toContain("Valuation Cache");
    expect(markup).toContain("Provider Usage");
    expect(markup).toContain('href="/admin/valuation-provider-usage"');
    expect(markup).toContain("Users");
  });
});

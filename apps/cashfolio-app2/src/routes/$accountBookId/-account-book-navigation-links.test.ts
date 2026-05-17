import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/link-nav-link", () => ({
  LinkNavLink: ({
    label,
    params,
    to,
  }: {
    label: string;
    params?: { accountBookId: string };
    to: string;
  }) =>
    createElement(
      "a",
      {
        href: params ? to.replace("$accountBookId", params.accountBookId) : to,
      },
      label,
    ),
}));

import { AccountBookAdminNavigationLinks } from "./-account-book-navigation-links";

const commonProps = {
  accountBookId: "book-1",
  activeSection: "accounts" as const,
  accountsLinkSearch: { tab: "ASSET" as const, mode: "active" as const },
  collapsed: false,
  onNavigate: vi.fn(),
  periodLinkSearch: {},
};

function renderAdminNavigation(canAccessAdmin: boolean) {
  return renderToStaticMarkup(
    createElement(
      MantineProvider,
      null,
      createElement(AccountBookAdminNavigationLinks, {
        ...commonProps,
        canAccessAdmin,
      }),
    ),
  );
}

describe("AccountBookAdminNavigationLinks", () => {
  it("shows the root Admin link for users with Admin access", () => {
    const markup = renderAdminNavigation(true);

    expect(markup).toContain("Settings");
    expect(markup).toContain('href="/admin"');
  });

  it("hides only the root Admin link for users without Admin access", () => {
    const markup = renderAdminNavigation(false);

    expect(markup).toContain("Settings");
    expect(markup).not.toContain('href="/admin"');
  });
});

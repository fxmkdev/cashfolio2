import { MantineProvider } from "@mantine/core";
import { createElement, forwardRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PageBreadcrumbs } from "./page-breadcrumbs";

vi.mock("./link-anchor", () => ({
  LinkAnchor: forwardRef<HTMLAnchorElement, { to: string }>(
    function MockLinkAnchor({ to, ...props }, ref) {
      return createElement("a", {
        ...props,
        ref,
        href: to,
        "data-router-link": "true",
      });
    },
  ),
}));

describe("PageBreadcrumbs", () => {
  it("renders linked parent crumbs and the current crumb", () => {
    const markup = renderToStaticMarkup(
      <MantineProvider>
        <PageBreadcrumbs
          items={[
            { label: "Accounts", to: "/storybook-book/accounts" },
            { label: "Archive" },
          ]}
        />
      </MantineProvider>,
    );

    expect(markup).toContain('href="/storybook-book/accounts"');
    expect(markup).toContain('data-router-link="true"');
    expect(markup).toContain("Accounts");
    expect(markup).toContain("Archive");
    expect(markup).toContain("/");
  });

  it("renders disabled parent crumbs without links", () => {
    const markup = renderToStaticMarkup(
      <MantineProvider>
        <PageBreadcrumbs
          items={[
            {
              label: "Brokerage",
              to: "/storybook-book/brokerage",
              disabled: true,
            },
            { label: "Import Statement" },
          ]}
        />
      </MantineProvider>,
    );

    expect(markup).not.toContain('href="/storybook-book/brokerage"');
    expect(markup).toContain("Brokerage");
    expect(markup).toContain("Import Statement");
  });
});

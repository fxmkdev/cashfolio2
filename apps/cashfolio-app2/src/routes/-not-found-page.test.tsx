import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NotFoundPage, NotFoundPageView } from "./-not-found-page";

const getAuthenticationStatus = vi.hoisted(() => vi.fn());
vi.mock("@/server/authentication", () => ({ getAuthenticationStatus }));

describe("NotFoundPage", () => {
  it("renders a standalone 404 page with a link back to the app", () => {
    const markup = renderToStaticMarkup(
      createElement(MantineProvider, null, createElement(NotFoundPage)),
    );

    expect(markup).toContain("404");
    expect(markup).toMatch(/<h1\b[^>]*>Page Not Found<\/h1>/);
    expect(markup).toContain(
      "The page you requested could not be found or is no longer available.",
    );
    expect(markup).toContain('href="/"');
    expect(markup).toContain("Go to App");
    expect(markup).toContain("<main");
    expect(markup).not.toContain("Sign Out");
    expect(getAuthenticationStatus).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "shows the Sign Out POST form only when authenticated=%s",
    (isAuthenticated) => {
      const markup = renderToStaticMarkup(
        createElement(
          MantineProvider,
          null,
          createElement(NotFoundPageView, { isAuthenticated }),
        ),
      );

      expect(markup).toContain("Go to App");
      if (isAuthenticated) {
        expect(markup).toContain('action="/api/logto/sign-out"');
        expect(markup).toContain('method="post"');
        expect(markup).toContain('type="submit"');
        expect(markup).toContain("Sign Out");
      } else {
        expect(markup).not.toContain("Sign Out");
        expect(markup).not.toContain("/api/logto/sign-out");
      }
    },
  );
});

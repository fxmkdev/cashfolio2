import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotFoundPage } from "./-not-found-page";

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
  });
});

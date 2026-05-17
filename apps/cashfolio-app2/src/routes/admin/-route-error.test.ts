import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminRouteErrorComponent } from "./-route-error";

describe("AdminRouteErrorComponent", () => {
  it("renders an explanatory 403 Admin access page", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MantineProvider,
        null,
        createElement(AdminRouteErrorComponent, {
          error: new Response("Forbidden", { status: 403 }) as unknown as Error,
          reset: () => {},
        }),
      ),
    );

    expect(markup).toContain("Admin access required");
    expect(markup).toContain(
      "Your account is not authorized to access the Admin area.",
    );
    expect(markup).toContain('href="/"');
    expect(markup).toContain("Go to App");
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MantineProvider } from "@mantine/core";
import { NewAccountBookSignOutForm } from "./-new-account-book-sign-out-form";

describe("NewAccountBookSignOutForm", () => {
  it("renders a sign-out post form", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MantineProvider,
        null,
        createElement(NewAccountBookSignOutForm),
      ),
    );

    expect(markup).toContain('action="/api/logto/sign-out"');
    expect(markup).toContain('method="post"');
    expect(markup).toContain('type="submit"');
    expect(markup).toContain("Sign out");
  });
});

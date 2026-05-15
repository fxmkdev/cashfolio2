import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SplitButtonGroup } from "./split-button";

describe("SplitButtonGroup", () => {
  it("renders attached button children", () => {
    const html = renderToStaticMarkup(
      createElement(
        MantineProvider,
        null,
        createElement(
          SplitButtonGroup,
          null,
          createElement("button", { type: "button" }, "Previous"),
          createElement("button", { type: "button" }, "Next"),
        ),
      ),
    );

    expect(html).toContain("Previous");
    expect(html).toContain("Next");
  });
});

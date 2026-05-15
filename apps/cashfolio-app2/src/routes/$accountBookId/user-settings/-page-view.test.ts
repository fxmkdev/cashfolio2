import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UserSettingsPageView } from "./-page-view";

describe("UserSettingsPageView", () => {
  it("renders user settings fields and account security link", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MantineProvider,
        null,
        createElement(UserSettingsPageView, {
          settings: {
            name: "Ada Lovelace",
            avatarUrl: "https://example.test/ada.png",
            initials: "AL",
          },
          onSubmit: vi.fn(),
        }),
      ),
    );

    expect(markup).toContain("User Settings");
    expect(markup).not.toContain("Account Security");
    expect(markup).not.toContain("https://tenant.logto.app/account/security");
    expect(markup).toContain("Name");
    expect(markup).toContain("Avatar URL");
    expect(markup).toContain('value="Ada Lovelace"');
    expect(markup).toContain('value="https://example.test/ada.png"');
    expect(markup).toContain('src="https://example.test/ada.png"');
  });
});

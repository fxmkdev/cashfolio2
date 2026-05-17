import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { formatUserLocaleSample } from "@/user-locale";
import { UserSettingsPageView } from "./-page-view";

function normalizeRenderedSample(value: string) {
  return value.replaceAll("&#x27;", "'").replaceAll("’", "'");
}

describe("UserSettingsPageView", () => {
  it("renders user settings fields without the account security link", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MantineProvider,
        null,
        createElement(UserSettingsPageView, {
          returnTarget: null,
          settings: {
            name: "Ada Lovelace",
            avatarUrl: "https://example.test/ada.png",
            initials: "AL",
            locale: "de-CH",
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
    expect(markup).toContain("Regional Format");
    expect(markup).toContain("Regional format is stored in Cashfolio");
    expect(markup).toContain("German (Switzerland)");
    expect(normalizeRenderedSample(markup)).toContain(
      normalizeRenderedSample(`Example: ${formatUserLocaleSample("de-CH")}`),
    );
    expect(markup).not.toContain("Locale is stored");
    expect(markup).toContain('value="Ada Lovelace"');
    expect(markup).toContain('value="https://example.test/ada.png"');
    expect(markup).toContain('src="https://example.test/ada.png"');
  });
});

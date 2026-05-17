import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_LOCALE,
  formatUserLocaleSample,
  isSupportedUserLocale,
  normalizeUserLocaleInput,
  resolveSupportedUserLocale,
  resolveUserLocaleFromAcceptLanguage,
  USER_LOCALE_OPTIONS,
} from "./user-locale";

describe("user locale helpers", () => {
  it("resolves supported locales case-insensitively to canonical tags", () => {
    expect(isSupportedUserLocale("de-ch")).toBe(true);
    expect(resolveSupportedUserLocale("de-ch")).toBe("de-CH");
    expect(resolveSupportedUserLocale("  FR-fr  ")).toBe("fr-FR");
    expect(resolveSupportedUserLocale(" es-es ")).toBe("es-ES");
    expect(resolveSupportedUserLocale("fr-ca")).toBe("fr-CA");
    expect(resolveSupportedUserLocale("ja-jp")).toBe("ja-JP");
    expect(normalizeUserLocaleInput(" fr-fr ")).toBe("fr-FR");
    expect(normalizeUserLocaleInput("pt-BR")).toBe(DEFAULT_USER_LOCALE);
    expect(normalizeUserLocaleInput(null)).toBe(DEFAULT_USER_LOCALE);
  });

  it("resolves Accept-Language locales to canonical supported tags", () => {
    expect(resolveUserLocaleFromAcceptLanguage("de-ch,de;q=0.8")).toBe("de-CH");
    expect(resolveUserLocaleFromAcceptLanguage("fr-ca,fr;q=0.8")).toBe("fr-CA");
    expect(resolveUserLocaleFromAcceptLanguage("de;q=0.8")).toBe("de-DE");
  });

  it("falls back to en-US when no supported locale is requested", () => {
    expect(resolveUserLocaleFromAcceptLanguage("pt-BR,ko-KR;q=0.9")).toBe(
      DEFAULT_USER_LOCALE,
    );
    expect(DEFAULT_USER_LOCALE).toBe("en-US");
  });

  it("exposes flat label-sorted options and formatting samples for all supported locales", () => {
    expect(USER_LOCALE_OPTIONS).toHaveLength(20);
    expect(
      new Set(USER_LOCALE_OPTIONS.map((option) => option.value)).size,
    ).toBe(20);
    expect(USER_LOCALE_OPTIONS.map((option) => option.label)).toEqual([
      "Dutch (Netherlands)",
      "English (Australia)",
      "English (Canada)",
      "English (Hong Kong)",
      "English (India)",
      "English (Singapore)",
      "English (Switzerland)",
      "English (United Kingdom)",
      "English (United States)",
      "French (Belgium)",
      "French (Canada)",
      "French (France)",
      "French (Switzerland)",
      "German (Austria)",
      "German (Germany)",
      "German (Switzerland)",
      "Italian (Italy)",
      "Italian (Switzerland)",
      "Japanese (Japan)",
      "Spanish (Spain)",
    ]);
    expect(Object.keys(USER_LOCALE_OPTIONS[0] ?? {}).toSorted()).toEqual([
      "label",
      "sample",
      "value",
    ]);
    expect(formatUserLocaleSample("en-US")).toBe("May 17, 2026 · 1,234,567.89");
  });
});

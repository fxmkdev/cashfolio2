import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_LOCALE,
  isSupportedUserLocale,
  resolveSupportedUserLocale,
  resolveUserLocaleFromAcceptLanguage,
} from "./user-locale";

describe("user locale helpers", () => {
  it("resolves supported locales case-insensitively to canonical tags", () => {
    expect(isSupportedUserLocale("de-ch")).toBe(true);
    expect(resolveSupportedUserLocale("de-ch")).toBe("de-CH");
    expect(resolveSupportedUserLocale("  FR-fr  ")).toBe("fr-FR");
  });

  it("resolves Accept-Language locales to canonical supported tags", () => {
    expect(resolveUserLocaleFromAcceptLanguage("de-ch,de;q=0.8")).toBe("de-CH");
    expect(resolveUserLocaleFromAcceptLanguage("fr-ca,fr;q=0.8")).toBe("fr-CH");
  });

  it("falls back to en-US when no supported locale is requested", () => {
    expect(resolveUserLocaleFromAcceptLanguage("es-ES,pt-BR;q=0.9")).toBe(
      DEFAULT_USER_LOCALE,
    );
    expect(DEFAULT_USER_LOCALE).toBe("en-US");
  });
});

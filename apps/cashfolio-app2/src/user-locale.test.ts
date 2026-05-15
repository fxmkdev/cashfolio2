import { describe, expect, it } from "vitest";
import {
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
});

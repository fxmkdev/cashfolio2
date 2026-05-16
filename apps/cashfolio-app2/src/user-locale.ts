export const DEFAULT_USER_LOCALE = "en-US";

export const SUPPORTED_USER_LOCALES = [
  "en-CH",
  "de-CH",
  "fr-CH",
  "it-CH",
  "en-US",
  "en-GB",
  "de-DE",
  "fr-FR",
] as const;

export type UserLocale = (typeof SUPPORTED_USER_LOCALES)[number];

export const USER_LOCALE_OPTIONS: Array<{
  value: UserLocale;
  label: string;
}> = [
  { value: "en-CH", label: "English (Switzerland)" },
  { value: "de-CH", label: "German (Switzerland)" },
  { value: "fr-CH", label: "French (Switzerland)" },
  { value: "it-CH", label: "Italian (Switzerland)" },
  { value: "en-US", label: "English (United States)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "de-DE", label: "German (Germany)" },
  { value: "fr-FR", label: "French (France)" },
];

const supportedLocaleLookup = new Map<string, UserLocale>(
  SUPPORTED_USER_LOCALES.map((locale) => [locale.toLowerCase(), locale]),
);

export function isSupportedUserLocale(value: string): boolean {
  return resolveSupportedUserLocale(value) != null;
}

export function resolveSupportedUserLocale(value: string): UserLocale | null {
  return supportedLocaleLookup.get(value.trim().toLowerCase()) ?? null;
}

export function normalizeUserLocaleInput(value: unknown): UserLocale {
  return typeof value === "string"
    ? (resolveSupportedUserLocale(value) ?? DEFAULT_USER_LOCALE)
    : DEFAULT_USER_LOCALE;
}

export function resolveUserLocaleFromAcceptLanguage(
  acceptLanguage: string | null,
): UserLocale {
  const requestedLocales = parseAcceptLanguageHeader(acceptLanguage);

  for (const requestedLocale of requestedLocales) {
    const exactMatch = resolveSupportedUserLocale(requestedLocale);
    if (exactMatch) {
      return exactMatch;
    }

    const requestedLanguage = requestedLocale.split("-")[0]?.toLowerCase();
    const languageMatch = SUPPORTED_USER_LOCALES.find(
      (locale) => locale.split("-")[0]?.toLowerCase() === requestedLanguage,
    );
    if (languageMatch) {
      return languageMatch;
    }
  }

  return DEFAULT_USER_LOCALE;
}

function parseAcceptLanguageHeader(acceptLanguage: string | null) {
  if (!acceptLanguage) {
    return [];
  }

  return acceptLanguage
    .split(",")
    .map((entry, index) => {
      const [locale, ...parameterParts] = entry.trim().split(";");
      const quality = parameterParts.reduce((resolvedQuality, parameter) => {
        const [name, value] = parameter.trim().split("=");
        if (name !== "q" || value == null) {
          return resolvedQuality;
        }

        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : resolvedQuality;
      }, 1);

      return {
        locale: locale.trim(),
        quality,
        index,
      };
    })
    .filter((entry) => entry.locale.length > 0 && entry.quality > 0)
    .sort(
      (left, right) => right.quality - left.quality || left.index - right.index,
    )
    .map((entry) => entry.locale);
}

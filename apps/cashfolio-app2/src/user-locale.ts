export const DEFAULT_USER_LOCALE = "en-US";

export const SUPPORTED_USER_LOCALES = [
  "en-AU",
  "de-AT",
  "fr-BE",
  "en-CA",
  "fr-CA",
  "fr-FR",
  "de-DE",
  "en-HK",
  "en-IN",
  "it-IT",
  "ja-JP",
  "nl-NL",
  "en-SG",
  "es-ES",
  "en-CH",
  "de-CH",
  "fr-CH",
  "it-CH",
  "en-GB",
  "en-US",
] as const;

export type UserLocale = (typeof SUPPORTED_USER_LOCALES)[number];

export type UserLocaleOption = {
  value: UserLocale;
  label: string;
  sample: string;
};

const SAMPLE_DATE = new Date(Date.UTC(2026, 4, 17));
const SAMPLE_NUMBER = 1234567.89;

const USER_LOCALE_OPTION_DEFINITIONS: Array<{
  value: UserLocale;
  label: string;
}> = [
  { value: "nl-NL", label: "Dutch (Netherlands)" },
  { value: "en-AU", label: "English (Australia)" },
  { value: "en-CA", label: "English (Canada)" },
  { value: "en-HK", label: "English (Hong Kong)" },
  { value: "en-IN", label: "English (India)" },
  { value: "en-SG", label: "English (Singapore)" },
  { value: "en-CH", label: "English (Switzerland)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "en-US", label: "English (United States)" },
  { value: "fr-BE", label: "French (Belgium)" },
  { value: "fr-CA", label: "French (Canada)" },
  { value: "fr-FR", label: "French (France)" },
  { value: "fr-CH", label: "French (Switzerland)" },
  { value: "de-AT", label: "German (Austria)" },
  { value: "de-DE", label: "German (Germany)" },
  { value: "de-CH", label: "German (Switzerland)" },
  { value: "it-IT", label: "Italian (Italy)" },
  { value: "it-CH", label: "Italian (Switzerland)" },
  { value: "ja-JP", label: "Japanese (Japan)" },
  { value: "es-ES", label: "Spanish (Spain)" },
];

export function formatUserLocaleSample(locale: UserLocale): string {
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(SAMPLE_DATE);
  const number = new Intl.NumberFormat(locale).format(SAMPLE_NUMBER);

  return `${date} · ${number}`;
}

export const USER_LOCALE_OPTIONS: UserLocaleOption[] =
  USER_LOCALE_OPTION_DEFINITIONS.map((item) => ({
    ...item,
    sample: formatUserLocaleSample(item.value),
  }));

const supportedLocaleLookup = new Map<string, UserLocale>(
  SUPPORTED_USER_LOCALES.map((locale) => [locale.toLowerCase(), locale]),
);

const userLocaleLanguageFallbacks: Partial<Record<string, UserLocale>> = {
  de: "de-DE",
  en: DEFAULT_USER_LOCALE,
  es: "es-ES",
  fr: "fr-FR",
  it: "it-IT",
  ja: "ja-JP",
  nl: "nl-NL",
};

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
    const languageMatch =
      requestedLanguage == null
        ? undefined
        : (userLocaleLanguageFallbacks[requestedLanguage] ??
          SUPPORTED_USER_LOCALES.find(
            (locale) =>
              locale.split("-")[0]?.toLowerCase() === requestedLanguage,
          ));
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

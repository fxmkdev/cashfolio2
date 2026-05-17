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
  country: string;
  sample: string;
};

export type UserLocaleOptionGroup = {
  group: string;
  items: Array<{
    value: UserLocale;
    label: string;
  }>;
};

const SAMPLE_DATE = new Date(Date.UTC(2026, 4, 17));
const SAMPLE_NUMBER = 1234567.89;

const USER_LOCALE_OPTION_GROUP_DEFINITIONS: UserLocaleOptionGroup[] = [
  {
    group: "Australia",
    items: [{ value: "en-AU", label: "English (Australia)" }],
  },
  {
    group: "Austria",
    items: [{ value: "de-AT", label: "German (Austria)" }],
  },
  {
    group: "Belgium",
    items: [{ value: "fr-BE", label: "French (Belgium)" }],
  },
  {
    group: "Canada",
    items: [
      { value: "en-CA", label: "English (Canada)" },
      { value: "fr-CA", label: "French (Canada)" },
    ],
  },
  {
    group: "France",
    items: [{ value: "fr-FR", label: "French (France)" }],
  },
  {
    group: "Germany",
    items: [{ value: "de-DE", label: "German (Germany)" }],
  },
  {
    group: "Hong Kong",
    items: [{ value: "en-HK", label: "English (Hong Kong)" }],
  },
  {
    group: "India",
    items: [{ value: "en-IN", label: "English (India)" }],
  },
  {
    group: "Italy",
    items: [{ value: "it-IT", label: "Italian (Italy)" }],
  },
  {
    group: "Japan",
    items: [{ value: "ja-JP", label: "Japanese (Japan)" }],
  },
  {
    group: "Netherlands",
    items: [{ value: "nl-NL", label: "Dutch (Netherlands)" }],
  },
  {
    group: "Singapore",
    items: [{ value: "en-SG", label: "English (Singapore)" }],
  },
  {
    group: "Spain",
    items: [{ value: "es-ES", label: "Spanish (Spain)" }],
  },
  {
    group: "Switzerland",
    items: [
      { value: "en-CH", label: "English (Switzerland)" },
      { value: "de-CH", label: "German (Switzerland)" },
      { value: "fr-CH", label: "French (Switzerland)" },
      { value: "it-CH", label: "Italian (Switzerland)" },
    ],
  },
  {
    group: "United Kingdom",
    items: [{ value: "en-GB", label: "English (United Kingdom)" }],
  },
  {
    group: "United States",
    items: [{ value: "en-US", label: "English (United States)" }],
  },
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
  USER_LOCALE_OPTION_GROUP_DEFINITIONS.flatMap(({ group, items }) =>
    items.map((item) => ({
      ...item,
      country: group,
      sample: formatUserLocaleSample(item.value),
    })),
  );

export const USER_LOCALE_OPTION_GROUPS: UserLocaleOptionGroup[] =
  USER_LOCALE_OPTION_GROUP_DEFINITIONS.map(({ group, items }) => ({
    group,
    items: items.map((item) => ({ ...item })),
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

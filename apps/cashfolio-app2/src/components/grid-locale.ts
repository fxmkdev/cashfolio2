import {
  DEFAULT_USER_LOCALE,
  normalizeUserLocaleInput,
  type UserLocale,
} from "@/user-locale";

export function getGridUserLocale(context: unknown): UserLocale {
  if (
    typeof context === "object" &&
    context !== null &&
    "userLocale" in context
  ) {
    return normalizeUserLocaleInput(
      (context as { userLocale?: unknown }).userLocale,
    );
  }

  return DEFAULT_USER_LOCALE;
}

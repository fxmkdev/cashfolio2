import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ensureAuthenticated } from "@/auth/functions.server";
import {
  fetchLogtoAccountApi,
  getLogtoAccountSecurityUrl,
} from "@/auth/logto.server";
import {
  resolveAuthenticatedUserProfile,
  type AuthenticatedUserProfile,
} from "@/auth/user-profile";
import { ensureSameOriginRequestFromServerContext } from "@/security/same-origin.server";
import {
  isSupportedUserLocale,
  resolveUserLocaleFromAcceptLanguage,
  type UserLocale,
} from "@/user-locale";
import { ensureUser } from "@/users/functions.server";
import { prisma } from "@/prisma.server";
import { assertRecord } from "./input-validation";

export type AuthenticatedUserSettings = {
  name: string;
  avatarUrl: string;
  initials: string;
  locale: UserLocale;
};

type LogtoAccountResponse = {
  username: string | null;
  primaryEmail: string | null;
  email: string | null;
  name: string | null;
  avatar: string | null;
};

type NormalizedUserSettingsInput = {
  name: string | null;
  avatarUrl: string | null;
  locale: UserLocale;
};

const fieldLabels = {
  avatarUrl: "Avatar URL",
  locale: "Locale",
  name: "Name",
} as const;

const accountApiAccessMessage =
  "Account settings need a fresh sign-in. Please sign out and sign in again.";

const accountApiAccessErrorCodes = new Set([
  "consent_required",
  "interaction_required",
  "invalid_grant",
  "invalid_scope",
  "login_required",
  "not_authenticated",
]);

function getNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readLogtoAccountResponse(value: unknown): LogtoAccountResponse {
  const data =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};

  return {
    username: getNullableString(data.username),
    primaryEmail: getNullableString(data.primaryEmail),
    email: getNullableString(data.email),
    name: getNullableString(data.name),
    avatar: getNullableString(data.avatar),
  };
}

function readOptionalTextField(
  data: Record<string, unknown>,
  field: "avatarUrl" | "name",
): string | null {
  const value = data[field];
  if (value == null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${fieldLabels[field]} must be a string.`);
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readLocaleField(data: Record<string, unknown>): UserLocale {
  const value = data.locale;
  if (typeof value !== "string") {
    throw new Error(`${fieldLabels.locale} must be a string.`);
  }

  const normalized = value.trim();
  if (!isSupportedUserLocale(normalized)) {
    throw new Error(`${fieldLabels.locale} must be a supported locale.`);
  }

  return normalized;
}

export function normalizeUserSettingsInput(
  value: unknown,
): NormalizedUserSettingsInput {
  assertRecord(value);

  const name = readOptionalTextField(value, "name");
  if (name && name.length > 128) {
    throw new Error("Name cannot be longer than 128 characters.");
  }

  const avatarUrl = readOptionalTextField(value, "avatarUrl");
  if (avatarUrl && avatarUrl.length > 2048) {
    throw new Error("Avatar URL cannot be longer than 2048 characters.");
  }
  if (avatarUrl) {
    let url: URL;
    try {
      url = new URL(avatarUrl);
    } catch {
      throw new Error("Avatar URL must be a valid absolute URL.");
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Avatar URL must use HTTP or HTTPS.");
    }
  }

  return { name, avatarUrl, locale: readLocaleField(value) };
}

function resolveAuthenticatedUserSettingsLocale(
  locale: string | null | undefined,
): UserLocale {
  if (locale && isSupportedUserLocale(locale)) {
    return locale;
  }

  return resolveUserLocaleFromAcceptLanguage(
    getRequest().headers.get("accept-language"),
  );
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readLogtoErrorMessage(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const data = value as Record<string, unknown>;
  return (
    getNullableString(data.message) ??
    getNullableString(data.errorDescription) ??
    getNullableString(data.error_description) ??
    getNullableString(data.error)
  );
}

async function assertLogtoAccountApiOk(
  response: Response,
  fallbackMessage: string,
) {
  if (response.ok) {
    return;
  }

  const message =
    readLogtoErrorMessage(await readJsonResponse(response)) ?? fallbackMessage;
  throw new Error(message);
}

async function fetchAuthenticatedLogtoAccount(): Promise<LogtoAccountResponse> {
  const response = await fetchLogtoAccountApiSafely("/api/my-account");
  await assertLogtoAccountApiOk(response, "Failed to load user settings.");
  return readLogtoAccountResponse(await readJsonResponse(response));
}

async function fetchLogtoAccountApiSafely(
  pathname: string,
  init?: RequestInit,
) {
  try {
    return init
      ? await fetchLogtoAccountApi(pathname, init)
      : await fetchLogtoAccountApi(pathname);
  } catch (error) {
    if (isLogtoAccountApiAccessError(error)) {
      throw new Error(accountApiAccessMessage);
    }
    throw error;
  }
}

function isLogtoAccountApiAccessError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const data = error as Record<string, unknown>;
  return (
    typeof data.code === "string" && accountApiAccessErrorCodes.has(data.code)
  );
}

function resolveSettingsProfileFromLogtoAccount(
  account: LogtoAccountResponse,
): AuthenticatedUserProfile {
  return resolveAuthenticatedUserProfile({
    name: account.name ?? account.username ?? account.primaryEmail,
    email: account.email ?? account.primaryEmail,
    picture: account.avatar,
  });
}

export const getAuthenticatedUserProfile = createServerFn({
  method: "GET",
}).handler(async (): Promise<AuthenticatedUserProfile> => {
  const context = await ensureAuthenticated();
  try {
    return resolveSettingsProfileFromLogtoAccount(
      await fetchAuthenticatedLogtoAccount(),
    );
  } catch {
    return resolveAuthenticatedUserProfile(context.claims);
  }
});

export const getUserAccountSecurityUrl = createServerFn({
  method: "GET",
}).handler(() => {
  try {
    return getLogtoAccountSecurityUrl();
  } catch {
    return null;
  }
});

export const getAuthenticatedUserSettings = createServerFn({
  method: "GET",
}).handler(async (): Promise<AuthenticatedUserSettings> => {
  const user = await ensureUser();
  const account = await fetchAuthenticatedLogtoAccount();
  const profile = resolveSettingsProfileFromLogtoAccount(account);

  return {
    name: account.name ?? "",
    avatarUrl: account.avatar ?? "",
    initials: profile.initials,
    locale: resolveAuthenticatedUserSettingsLocale(user.locale),
  };
});

export const updateAuthenticatedUserSettings = createServerFn({
  method: "POST",
})
  .inputValidator(normalizeUserSettingsInput)
  .handler(async ({ data }): Promise<AuthenticatedUserSettings> => {
    ensureSameOriginRequestFromServerContext();
    const user = await ensureUser();

    const response = await fetchLogtoAccountApiSafely("/api/my-account", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: data.name,
        avatar: data.avatarUrl,
      }),
    });
    await assertLogtoAccountApiOk(response, "Failed to save user settings.");

    await prisma.user.update({
      where: { id: user.id },
      data: { locale: data.locale },
    });

    const account = readLogtoAccountResponse(await readJsonResponse(response));
    const profile = resolveSettingsProfileFromLogtoAccount(account);

    return {
      name: account.name ?? "",
      avatarUrl: account.avatar ?? "",
      initials: profile.initials,
      locale: data.locale,
    };
  });

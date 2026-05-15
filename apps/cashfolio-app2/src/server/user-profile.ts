import { createServerFn } from "@tanstack/react-start";
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
import { assertRecord } from "./input-validation";

export type AuthenticatedUserSettings = {
  name: string;
  avatarUrl: string;
  initials: string;
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
};

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
    throw new Error(`${field} must be a string.`);
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
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

  return { name, avatarUrl };
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
  const response = await fetchLogtoAccountApi("/api/my-account");
  await assertLogtoAccountApiOk(response, "Failed to load user settings.");
  return readLogtoAccountResponse(await readJsonResponse(response));
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
  await ensureAuthenticated();
  const account = await fetchAuthenticatedLogtoAccount();
  const profile = resolveSettingsProfileFromLogtoAccount(account);

  return {
    name: account.name ?? "",
    avatarUrl: account.avatar ?? "",
    initials: profile.initials,
  };
});

export const updateAuthenticatedUserSettings = createServerFn({
  method: "POST",
})
  .inputValidator(normalizeUserSettingsInput)
  .handler(async ({ data }): Promise<AuthenticatedUserSettings> => {
    ensureSameOriginRequestFromServerContext();
    await ensureAuthenticated();

    const response = await fetchLogtoAccountApi("/api/my-account", {
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

    const account = readLogtoAccountResponse(await readJsonResponse(response));
    const profile = resolveSettingsProfileFromLogtoAccount(account);

    return {
      name: account.name ?? "",
      avatarUrl: account.avatar ?? "",
      initials: profile.initials,
    };
  });

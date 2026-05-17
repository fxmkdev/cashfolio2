type LogtoManagementToken = {
  accessToken: string;
  expiresAt: number;
};

type LogtoManagementTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
};

export type LogtoManagementUser = {
  id: string;
  username: string | null;
  primaryEmail: string | null;
  name: string | null;
  avatar: string | null;
  lastSignInAt: number | null;
};

let cachedManagementToken: LogtoManagementToken | null = null;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

function getManagementApiConfig() {
  return {
    endpoint: requireEnv("LOGTO_MANAGEMENT_API_ENDPOINT"),
    resource: requireEnv("LOGTO_MANAGEMENT_API_RESOURCE"),
    appId: requireEnv("LOGTO_MANAGEMENT_API_APP_ID"),
    appSecret: requireEnv("LOGTO_MANAGEMENT_API_APP_SECRET"),
  };
}

function getBasicAuthHeader(appId: string, appSecret: string): string {
  return `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readErrorMessage(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const data = value as Record<string, unknown>;
  const message =
    data.message ??
    data.error_description ??
    data.errorDescription ??
    data.error;

  return typeof message === "string" && message.trim().length > 0
    ? message.trim()
    : null;
}

function readTokenResponse(value: unknown): {
  accessToken: string;
  expiresInSeconds: number;
} {
  const data =
    typeof value === "object" && value !== null
      ? (value as LogtoManagementTokenResponse)
      : {};

  if (
    typeof data.access_token !== "string" ||
    data.access_token.trim().length === 0
  ) {
    throw new Error(
      "Logto Management API token response is missing access_token.",
    );
  }

  return {
    accessToken: data.access_token,
    expiresInSeconds:
      typeof data.expires_in === "number" && data.expires_in > 0
        ? data.expires_in
        : 3600,
  };
}

function readNullableString(
  data: Record<string, unknown>,
  key: string,
): string | null {
  const value = data[key];
  return typeof value === "string" ? value : null;
}

function readNullableNumber(
  data: Record<string, unknown>,
  key: string,
): number | null {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readLogtoUserResponse(value: unknown): LogtoManagementUser {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Logto user response is invalid.");
  }

  const data = value as Record<string, unknown>;
  if (typeof data.id !== "string" || data.id.trim().length === 0) {
    throw new Error("Logto user response is missing id.");
  }

  return {
    id: data.id,
    username: readNullableString(data, "username"),
    primaryEmail: readNullableString(data, "primaryEmail"),
    name: readNullableString(data, "name"),
    avatar: readNullableString(data, "avatar"),
    lastSignInAt: readNullableNumber(data, "lastSignInAt"),
  };
}

export function clearLogtoManagementApiTokenCacheForTests() {
  cachedManagementToken = null;
}

export async function getLogtoManagementApiAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedManagementToken && cachedManagementToken.expiresAt - 60_000 > now) {
    return cachedManagementToken.accessToken;
  }

  const config = getManagementApiConfig();
  const response = await fetch(new URL("/oidc/token", config.endpoint), {
    method: "POST",
    headers: {
      authorization: getBasicAuthHeader(config.appId, config.appSecret),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      resource: config.resource,
      scope: "all",
    }).toString(),
  });

  const responseBody = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(
      readErrorMessage(responseBody) ??
        "Failed to fetch Logto Management API access token.",
    );
  }

  const token = readTokenResponse(responseBody);
  cachedManagementToken = {
    accessToken: token.accessToken,
    expiresAt: now + token.expiresInSeconds * 1000,
  };

  return token.accessToken;
}

export async function getLogtoUser(
  userId: string,
): Promise<LogtoManagementUser | null> {
  const config = getManagementApiConfig();
  const accessToken = await getLogtoManagementApiAccessToken();
  const response = await fetch(
    new URL(`/api/users/${encodeURIComponent(userId)}`, config.endpoint),
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (response.status === 404) {
    return null;
  }

  const responseBody = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(
      readErrorMessage(responseBody) ?? "Failed to fetch Logto user.",
    );
  }

  return readLogtoUserResponse(responseBody);
}

export async function deleteLogtoUser(userId: string): Promise<void> {
  const config = getManagementApiConfig();
  const accessToken = await getLogtoManagementApiAccessToken();
  const response = await fetch(
    new URL(`/api/users/${encodeURIComponent(userId)}`, config.endpoint),
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (response.status === 204 || response.status === 404) {
    return;
  }

  throw new Error(
    readErrorMessage(await readJsonResponse(response)) ??
      "Failed to delete Logto user.",
  );
}

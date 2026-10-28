import LogtoClient, {
  PersistKey,
  type LogtoConfig,
  type SessionData,
  type Storage,
  type StorageKey,
} from "@logto/node";

/** Request-local SDK storage; the owning transaction persists it once. */
export class LogtoSessionStorage implements Storage<StorageKey | PersistKey> {
  constructor(readonly data: SessionData = {}) {}
  async getItem(key: StorageKey | PersistKey) {
    return this.data[key] ?? null;
  }
  async setItem(key: StorageKey | PersistKey, value: string) {
    this.data[key] = value;
  }
  async removeItem(key: StorageKey | PersistKey) {
    delete this.data[key];
  }
}

export function createSessionClient(
  config: LogtoConfig,
  storage: LogtoSessionStorage,
  navigate: (url: string) => void = () => {},
) {
  return new LogtoClient(
    { ...config, requestTimeoutMs: 5_000 },
    {
      storage,
      navigate: async (url) => navigate(url),
    },
  );
}

export function hasUnexpiredClaims(claims: { exp?: number }, now = Date.now()) {
  return (
    typeof claims.exp === "number" &&
    Number.isFinite(claims.exp) &&
    claims.exp * 1000 > now
  );
}

export async function authenticateSessionClient(
  config: LogtoConfig,
  storage: LogtoSessionStorage,
) {
  let client = createSessionClient(config, storage);
  if (!(await client.isAuthenticated()))
    return { client, context: { isAuthenticated: false as const } };
  if (!hasUnexpiredClaims(await client.getIdTokenClaims())) {
    // A new client loads the changed storage rather than its stale in-memory map.
    await storage.removeItem(PersistKey.AccessToken);
    client = createSessionClient(config, storage);
  }
  // getContext catches token errors; request the token directly to distinguish
  // invalid credentials from a temporary provider outage.
  await client.getAccessToken();
  const context = await client.getContext({ getAccessToken: false });
  if (
    !context.isAuthenticated ||
    !context.claims ||
    !hasUnexpiredClaims(context.claims)
  ) {
    return { client, context: { isAuthenticated: false as const } };
  }
  return { client, context };
}

export function isInvalidSessionCredential(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? error.code : undefined;
  // The SDK wraps OAuth error bodies in unexpected_response_error.
  const data = "data" in error ? error.data : null;
  if (typeof data === "object" && data !== null && "error" in data) {
    if (data.error === "invalid_grant" || data.error === "invalid_token")
      return true;
  }
  return (
    typeof code === "string" &&
    [
      "invalid_grant",
      "not_authenticated",
      "login_required",
      "interaction_required",
      "consent_required",
      "invalid_token",
      "ERR_JWT_EXPIRED",
      "ERR_JWT_CLAIM_VALIDATION_FAILED",
      "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
      "ERR_JWT_INVALID",
      "ERR_JWS_INVALID",
      "ERR_JOSE_ALG_NOT_ALLOWED",
      "ERR_JOSE_NOT_SUPPORTED",
      "id_token.invalid_iat",
      "id_token.invalid_token",
    ].includes(code)
  );
}

/** Keep a rotated refresh credential without trusting any unverified tokens. */
export function getRefreshRecoveryData(
  previous: SessionData,
  updated: SessionData,
): SessionData | null {
  if (!updated.refreshToken || updated.refreshToken === previous.refreshToken)
    return null;
  const recovery = { ...previous, refreshToken: updated.refreshToken };
  delete recovery.accessToken;
  return recovery;
}

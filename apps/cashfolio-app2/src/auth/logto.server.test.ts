import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hashSessionToken,
  isSessionCurrent,
  newSessionToken,
  nextIdleDeadline,
  SESSION_COOKIE,
  sessionDeadlines,
} from "./session-policy";
import {
  closeTestProviders,
  createTestProvider,
  makeIdToken,
  providerEndpoint,
} from "./logto-test-provider";

const mocks = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  setCookie: vi.fn(),
  lock: vi.fn(),
  create: vi.fn(),
  read: vi.fn(),
  revoke: vi.fn(),
  save: vi.fn(),
  rows: new Map<string, any>(),
  user: { id: "user-1", externalId: "external-1", deletionPending: false },
  tx: {
    user: { createMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    authSubjectRevocation: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: (name: string) =>
    name === "__Host-cashfolio-session" ? mocks.cookie : "legacy-cookie",
  setCookie: mocks.setCookie,
}));
vi.mock("./session-store.server", () => ({
  withSessionLock: mocks.lock,
  createSession: mocks.create,
  readSessionData: mocks.read,
  revokeSession: mocks.revoke,
  saveSession: mocks.save,
}));
import {
  destroyLogtoSession,
  fetchLogtoAccountApi,
  getLogtoAccountSecurityUrl,
  getLogtoContext,
  handleLogtoSignIn,
  handleLogtoSignInCallback,
  handleLogtoSignOut,
  handleLogtoSignUp,
} from "./logto.server";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookie = undefined;
  mocks.rows.clear();
  mocks.user.deletionPending = false;
  for (const [name, value] of Object.entries({
    LOGTO_ENDPOINT: providerEndpoint,
    LOGTO_APP_ID: "test-app",
    LOGTO_APP_SECRET: "test-secret",
    BASE_URL: "https://app.example.test",
  }))
    vi.stubEnv(name, value);
  mocks.setCookie.mockImplementation((name, value) => {
    if (name === SESSION_COOKIE) mocks.cookie = value || undefined;
  });
  mocks.lock.mockImplementation(async (token, operation) => {
    const row = mocks.rows.get(token);
    if (row && !isSessionCurrent(row)) mocks.rows.delete(token);
    return operation(mocks.tx, mocks.rows.get(token) ?? null);
  });
  mocks.create.mockImplementation(async (_tx, data, userId) => {
    const token = newSessionToken();
    const row = {
      id: token,
      tokenHash: hashSessionToken(token),
      data: structuredClone(data),
      userId,
      user: userId ? mocks.user : null,
      ...sessionDeadlines(new Date(), !!userId),
    };
    mocks.rows.set(token, row);
    return { token, expiresAt: row.expiresAt };
  });
  mocks.read.mockImplementation(async (row) => structuredClone(row.data));
  mocks.revoke.mockImplementation(async (_tx, row) => {
    if (row) mocks.rows.delete(row.id);
  });
  mocks.save.mockImplementation(
    async (_tx, row, data, allowPending, renewIdle = true) => {
      if (
        !mocks.rows.has(row.id) ||
        !isSessionCurrent(row) ||
        (row.user.deletionPending && !allowPending)
      )
        return false;
      row.data = structuredClone(data);
      if (renewIdle) row.idleExpiresAt = nextIdleDeadline(row.expiresAt);
      return true;
    },
  );
  mocks.tx.user.findUniqueOrThrow.mockResolvedValue(mocks.user);
});
afterEach(() => {
  closeTestProviders();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function login() {
  const response = await handleLogtoSignIn();
  const pendingToken = mocks.cookie!;
  const state = new URL(response.headers.get("location")!).searchParams.get(
    "state",
  );
  await handleLogtoSignInCallback(
    new Request(
      `https://app.example.test/api/logto/callback?state=${state}&code=code`,
    ),
  );
  return { token: mocks.cookie!, pendingToken };
}
const signOutRequest = () =>
  new Request("https://app.example.test/api/logto/sign-out", {
    method: "POST",
    headers: { origin: "https://app.example.test" },
  });

describe("server-backed Logto authentication", () => {
  it("rejects missing/malformed/legacy cookies without consulting storage", async () => {
    for (const value of [undefined, "legacy.encrypted", "invalid"]) {
      mocks.cookie = value;
      expect((await getLogtoContext()).isAuthenticated).toBe(false);
    }
    expect(mocks.lock).not.toHaveBeenCalled();
  });
  it("rotates verified callback credentials and rejects pending cookie replay", async () => {
    createTestProvider();
    const { token, pendingToken } = await login();
    expect(token).not.toBe(pendingToken);
    expect(mocks.rows.has(pendingToken)).toBe(false);
    expect((await getLogtoContext()).isAuthenticated).toBe(true);
    expect(mocks.setCookie).toHaveBeenCalledWith(
      SESSION_COOKIE,
      token,
      expect.objectContaining({
        secure: true,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      }),
    );
    mocks.cookie = pendingToken;
    expect((await getLogtoContext()).isAuthenticated).toBe(false);
  });
  it("revokes a copied cookie before remote logout and rejects its replay", async () => {
    createTestProvider();
    const { token } = await login();
    await handleLogtoSignOut(signOutRequest());
    expect(mocks.rows.has(token)).toBe(false);
    mocks.cookie = token;
    expect((await getLogtoContext()).isAuthenticated).toBe(false);
  });
  it("finishes local logout despite a provider outage, but preserves cookies if DB revocation fails", async () => {
    createTestProvider();
    const { token } = await login();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect((await handleLogtoSignOut(signOutRequest())).status).toBe(302);
    expect(mocks.rows.has(token)).toBe(false);
    mocks.cookie = token;
    mocks.setCookie.mockClear();
    mocks.lock.mockRejectedValueOnce(new Error("database down"));
    await expect(handleLogtoSignOut(signOutRequest())).rejects.toThrow(
      "database down",
    );
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
  it("falls back home if remote sign-out cannot be constructed", async () => {
    createTestProvider();
    const { token } = await login();
    vi.stubEnv("LOGTO_APP_SECRET", "");
    expect(
      (await handleLogtoSignOut(signOutRequest())).headers.get("location"),
    ).toBe("/");
    expect(mocks.rows.has(token)).toBe(false);
  });
  it.each(["expiresAt", "idleExpiresAt"])(
    "rejects a saved cookie at %s",
    async (field) => {
      createTestProvider();
      const { token } = await login();
      mocks.rows.get(token)[field] = new Date(0);
      expect((await getLogtoContext()).isAuthenticated).toBe(false);
    },
  );
  it("keeps pending state intact when authentication status is queried", async () => {
    createTestProvider();
    await handleLogtoSignUp();
    const pending = mocks.cookie;
    expect((await getLogtoContext()).isAuthenticated).toBe(false);
    expect(mocks.cookie).toBe(pending);
    await destroyLogtoSession();
    expect(mocks.rows.has(pending!)).toBe(false);
  });
  it("rejects invalid/expired callbacks and does not create users", async () => {
    createTestProvider();
    await expect(
      handleLogtoSignInCallback(
        new Request("https://app.example.test/api/logto/callback"),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await handleLogtoSignIn();
    const pending = mocks.cookie!;
    await expect(
      handleLogtoSignInCallback(
        new Request(
          "https://app.example.test/api/logto/callback?state=wrong&code=code",
        ),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.rows.has(pending)).toBe(false);
    expect(mocks.tx.user.createMany).not.toHaveBeenCalled();
  });
  it("denies normal access during deletion but preserves deletion-only retries after Logto is gone", async () => {
    createTestProvider();
    const { token } = await login();
    mocks.user.deletionPending = true;
    mocks.rows.get(token).data.idToken = makeIdToken(-120);
    expect((await getLogtoContext()).isAuthenticated).toBe(false);
    expect(mocks.cookie).toBe(token);
    expect((await handleLogtoSignIn()).headers.get("location")).toBe(
      "/user/delete",
    );
    expect(mocks.cookie).toBe(token);
    expect(
      (await getLogtoContext(undefined, { allowDeletionPending: true }))
        .isAuthenticated,
    ).toBe(true);
    mocks.rows.delete(token); // User FK cascade after successful deletion.
    mocks.cookie = token;
    expect(
      (await getLogtoContext(undefined, { allowDeletionPending: true }))
        .isAuthenticated,
    ).toBe(false);
  });
  it("refreshes expired ID claims and revokes rejected refresh credentials", async () => {
    const provider = createTestProvider();
    const { token } = await login();
    mocks.rows.get(token).data.idToken = makeIdToken(-120);
    expect((await getLogtoContext()).isAuthenticated).toBe(true);
    mocks.rows.get(token).data.idToken = makeIdToken(-120);
    provider.options.refreshError = true;
    expect((await getLogtoContext()).isAuthenticated).toBe(false);
    expect(mocks.rows.has(token)).toBe(false);
  });
  it("fails closed on a temporary token-provider outage without revoking a retryable session", async () => {
    const provider = createTestProvider();
    const { token } = await login();
    mocks.rows.get(token).data.idToken = makeIdToken(-120);
    provider.options.unavailable = true;
    await expect(getLogtoContext()).rejects.toMatchObject({ status: 503 });
    expect(mocks.rows.has(token)).toBe(true);
  });
  it.each([false, true])(
    "commits rotated refresh recovery after JWKS failure (expired ID: %s)",
    async (expiredId) => {
      const provider = createTestProvider({ rotateRefreshTokens: true });
      const { token } = await login();
      const row = mocks.rows.get(token);
      row.data.idToken = makeIdToken(expiredId ? -120 : 3600);
      row.data.accessToken = JSON.stringify({
        "@": {
          token: "old-access",
          scope: "openid profile email",
          expiresAt: 0,
        },
      });
      const previous = structuredClone(row.data);
      const idleExpiresAt = row.idleExpiresAt;
      const expiresAt = row.expiresAt;
      provider.options.jwksUnavailable = true;
      let committed = false;
      const original = mocks.lock.getMockImplementation()!;
      mocks.lock.mockImplementationOnce(async (...args) => {
        const result = await original(...args);
        committed = true;
        return result;
      });
      await expect(getLogtoContext()).rejects.toMatchObject({ status: 503 });
      expect(committed).toBe(true);
      expect(row.data).toEqual({
        idToken: previous.idToken,
        refreshToken: "test-refresh-2",
      });
      expect(row.idleExpiresAt).toBe(idleExpiresAt);
      expect(row.expiresAt).toBe(expiresAt);
      provider.options.jwksUnavailable = false;
      expect((await getLogtoContext()).isAuthenticated).toBe(true);
      expect(
        provider.tokenRequests.slice(1).map((r) => r.refreshToken),
      ).toEqual(["test-refresh-1", "test-refresh-2"]);
    },
  );
  it.each(["invalidSignature", "invalidAudience"] as const)(
    "revokes on definitive %s failure rather than persisting recovery",
    async (failure) => {
      const provider = createTestProvider({ rotateRefreshTokens: true });
      const { token } = await login();
      mocks.rows.get(token).data.idToken = makeIdToken(-120);
      provider.options[failure] = true;
      expect((await getLogtoContext()).isAuthenticated).toBe(false);
      expect(mocks.rows.has(token)).toBe(false);
    },
  );
  it("keeps verified rotated credentials when downstream Account API work fails", async () => {
    const provider = createTestProvider({ rotateRefreshTokens: true });
    const { token } = await login();
    const row = mocks.rows.get(token);
    row.data.idToken = makeIdToken(-120);
    provider.options.accountApiUnavailable = true;
    await expect(fetchLogtoAccountApi("/api/my-account")).rejects.toMatchObject(
      { status: 503 },
    );
    expect(row.data.refreshToken).toBe("test-refresh-2");
    expect((await getLogtoContext()).isAuthenticated).toBe(true);
    expect(provider.tokenRequests).toHaveLength(2);
  });
  it.each(["expiresAt", "idleExpiresAt", "logout", "deletion"] as const)(
    "cannot recover over concurrent %s",
    async (change) => {
      const provider = createTestProvider({ rotateRefreshTokens: true });
      const { token } = await login();
      const row = mocks.rows.get(token);
      row.data.idToken = makeIdToken(-120);
      const previous = structuredClone(row.data);
      provider.options.jwksUnavailable = true;
      provider.options.afterTokenExchange = async () => {
        if (change === "logout") mocks.rows.delete(token);
        else if (change === "deletion") row.user.deletionPending = true;
        else row[change] = new Date(0);
      };
      await expect(getLogtoContext()).rejects.toMatchObject({ status: 503 });
      expect(row.data).toEqual(previous);
      provider.options.afterTokenExchange = undefined;
      provider.options.jwksUnavailable = false;
      expect((await getLogtoContext()).isAuthenticated).toBe(false);
    },
  );
  it("fails closed when recovery cannot be written to the database", async () => {
    const provider = createTestProvider({ rotateRefreshTokens: true });
    const { token } = await login();
    const row = mocks.rows.get(token);
    row.data.idToken = makeIdToken(-120);
    const previous = structuredClone(row.data);
    provider.options.jwksUnavailable = true;
    mocks.save.mockRejectedValueOnce(
      new Error("recovery database unavailable"),
    );
    await expect(getLogtoContext()).rejects.toThrow(
      "recovery database unavailable",
    );
    expect(row.data).toEqual(previous);
  });
  it("rejects callbacks for permanently revoked subjects without issuing a session", async () => {
    createTestProvider();
    mocks.tx.authSubjectRevocation.findUnique.mockResolvedValue({
      revokedAt: new Date(),
    });
    await expect(login()).rejects.toMatchObject({ status: 400 });
    expect(mocks.tx.user.createMany).not.toHaveBeenCalled();
    expect(mocks.rows.size).toBe(0);
  });
  it("does not accept a session whose subject changed or whose persistence failed", async () => {
    createTestProvider();
    const { token } = await login();
    mocks.save.mockResolvedValueOnce(false);
    expect((await getLogtoContext()).isAuthenticated).toBe(false);
    mocks.rows.get(token).data.idToken = makeIdToken(3600, "another-user");
    expect((await getLogtoContext()).isAuthenticated).toBe(false);
    expect(mocks.rows.has(token)).toBe(false);
  });
  it("requires authentication for Account API calls and guards logout origin", async () => {
    await expect(fetchLogtoAccountApi("/api/my-account")).rejects.toMatchObject(
      { status: 401 },
    );
    expect(getLogtoAccountSecurityUrl()).toBe(
      `${providerEndpoint}/account/security`,
    );
    await expect(
      handleLogtoSignOut(
        new Request("https://app.example.test", {
          method: "POST",
          headers: { origin: "https://evil.example.test" },
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.lock).not.toHaveBeenCalled();
  });
});

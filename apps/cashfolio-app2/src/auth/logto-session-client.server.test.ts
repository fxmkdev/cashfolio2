import { PersistKey } from "@logto/node";
import { afterEach, describe, expect, it } from "vitest";
import {
  authenticateSessionClient,
  createSessionClient,
  isInvalidSessionCredential,
  LogtoSessionStorage,
} from "./logto-session-client.server";
import {
  closeTestProviders,
  createTestProvider,
  makeIdToken,
  providerConfig,
  providerEndpoint,
} from "./logto-test-provider";

afterEach(closeTestProviders);

describe("real Logto SDK session integration", () => {
  it("refreshes expired ID claims even when the cached access token has time left", async () => {
    const provider = createTestProvider();
    const storage = new LogtoSessionStorage({
      idToken: makeIdToken(-1),
      refreshToken: "refresh",
      accessToken: JSON.stringify({
        "@": {
          token: "cached",
          scope: "openid profile email",
          expiresAt: Date.now() / 1000 + 3600,
        },
      }),
    });
    expect(
      await createSessionClient(providerConfig, storage).getAccessToken(),
    ).toBe("cached");
    expect(provider.requests).not.toContain(`${providerEndpoint}/token`);
    const result = await authenticateSessionClient(providerConfig, storage);
    const { context, accessToken } = result;
    expect(context.isAuthenticated).toBe(true);
    expect(context.claims!.exp).toBeGreaterThan(Date.now() / 1000);
    expect(provider.requests).toContain(`${providerEndpoint}/token`);
    expect(storage.data.refreshToken).toBe("test-refresh");
    expect(accessToken).toBe("test-access");
    expect(result).not.toHaveProperty("client");
  });
  it("rejects a refresh response that still has expired ID claims", async () => {
    createTestProvider({ expiresInSeconds: -120 });
    const { context } = await authenticateSessionClient(
      providerConfig,
      new LogtoSessionStorage({
        idToken: makeIdToken(-1),
        refreshToken: "refresh",
      }),
    );
    expect(context.isAuthenticated).toBe(false);
  });
  it("distinguishes invalid refresh credentials from temporary outages", async () => {
    createTestProvider({ refreshError: true });
    const error = await authenticateSessionClient(
      providerConfig,
      new LogtoSessionStorage({
        idToken: makeIdToken(-1),
        refreshToken: "refresh",
      }),
    ).catch((error: unknown) => error);
    expect(isInvalidSessionCredential(error)).toBe(true);
    expect(isInvalidSessionCredential(new Error("network unavailable"))).toBe(
      false,
    );
  });
  it("preserves real callback state and PKCE verification", async () => {
    createTestProvider();
    const storage = new LogtoSessionStorage();
    let navigate = "";
    const client = createSessionClient(providerConfig, storage, (url) => {
      navigate = url;
    });
    await client.signIn("https://app.example.test/api/logto/callback");
    const authorization = new URL(navigate);
    expect(authorization.searchParams.get("code_challenge_method")).toBe(
      "S256",
    );
    expect(authorization.searchParams.get("code_challenge")).toBeTruthy();
    const callback = `https://app.example.test/api/logto/callback?code=code&state=${authorization.searchParams.get("state")}`;
    const wrongState = createSessionClient(
      providerConfig,
      new LogtoSessionStorage({ ...storage.data }),
    );
    await expect(
      wrongState.handleSignInCallback(
        callback.replace(/state=.*/, "state=wrong"),
      ),
    ).rejects.toBeDefined();
    await client.handleSignInCallback(callback);
    expect(await client.isAuthenticated()).toBe(true);
    expect(await storage.getItem(PersistKey.SignInSession)).toBeNull();
  });
});

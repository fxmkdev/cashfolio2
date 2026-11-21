import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { copyArtifact, startArtifact } from "./artifact-test-support.ts";
import { startOidcFixture } from "./artifact-oidc-fixture.ts";

const sessionName = "__Host-cashfolio-session";

function assertNoStore(response: Response, status: number) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
}

function sessionCookie(response: Response) {
  const cookies = response.headers.getSetCookie();
  assert.equal(
    cookies.length,
    2,
    "Session and legacy cookies must stay separate",
  );
  const cookie = cookies.find((value) => value.startsWith(`${sessionName}=`));
  assert(cookie);
  assert.match(cookie, /; Path=\//i);
  assert.match(cookie, /; Secure/i);
  assert.match(cookie, /; HttpOnly/i);
  assert.match(cookie, /; SameSite=Lax/i);
  assert(
    cookies.some(
      (value) => /^logtoCookies=;/.test(value) && /Max-Age=0/i.test(value),
    ),
  );
  return cookie.split(";")[0];
}

test(
  "normal standalone HTTP authentication preserves redirects, cookies and revocation",
  { timeout: 60_000 },
  async (t) => {
    const databaseUrl = new URL(process.env.ARTIFACT_AUTH_DATABASE_URL ?? "");
    assert(["postgresql:", "postgres:"].includes(databaseUrl.protocol));
    assert(
      ["127.0.0.1", "localhost"].includes(databaseUrl.hostname),
      "Artifact auth requires an explicit disposable loopback database",
    );
    const directory = await copyArtifact(t, ".output");
    const provider = await startOidcFixture(t);
    const { baseUrl, request } = await startArtifact(t, directory, {
      DATABASE_URL: databaseUrl.href,
      SESSION_SECRET: randomBytes(32).toString("hex"),
      LOGTO_ENDPOINT: provider.endpoint,
      LOGTO_APP_ID: "artifact-app",
      LOGTO_APP_SECRET: "artifact-secret",
    });
    // An E2E identity cookie must never bypass normal authentication.
    const anonymous = await request("/", {
      headers: { cookie: "cashfolio-e2e-external-id=artifact-user" },
    });
    assert([302, 307].includes(anonymous.status));
    assert.equal(anonymous.headers.get("location"), "/api/logto/sign-in");
    assert.equal(anonymous.headers.get("cache-control"), "no-store");
    for (const [path, status] of [
      ["/api/logto/callback?code=invalid", 400],
      ["/api/logto/sign-out", 405],
    ] as const) {
      const response = await request(path);
      assertNoStore(response, status);
      if (status === 405) assert.equal(response.headers.get("allow"), "POST");
    }
    for (const action of ["sign-in", "sign-up"]) {
      const signIn = await request(`/api/logto/${action}`);
      assertNoStore(signIn, 302);
      const authorization = new URL(signIn.headers.get("location")!);
      assert.equal(authorization.origin, provider.endpoint);
      assert.equal(authorization.pathname, "/authorize");
      assert.equal(
        authorization.searchParams.get("redirect_uri"),
        `${baseUrl}/api/logto/callback`,
      );
      assert.equal(authorization.searchParams.get("client_id"), "artifact-app");
      assert(authorization.searchParams.get("state"));
      assert(authorization.searchParams.get("code_challenge"));
      if (action === "sign-up")
        assert.equal(
          authorization.searchParams.get("interaction_mode"),
          "signUp",
        );
      const pendingCookie = sessionCookie(signIn);
      const callback = await request(
        `/api/logto/callback?${new URLSearchParams({
          state: authorization.searchParams.get("state")!,
          code: `artifact-${action}`,
        })}`,
        { headers: { cookie: pendingCookie } },
      );
      assertNoStore(callback, 302);
      assert.equal(callback.headers.get("location"), "/");
      const authenticatedCookie = sessionCookie(callback);
      assert.notEqual(
        authenticatedCookie,
        pendingCookie,
        "Callback must rotate the session",
      );
      const authenticated = await request("/", {
        headers: { cookie: authenticatedCookie },
      });
      assert([302, 307].includes(authenticated.status));
      assert.equal(authenticated.headers.get("location"), "/account-books/new");
      assert.equal(authenticated.headers.get("cache-control"), "no-store");
      const signOut = await request("/api/logto/sign-out", {
        method: "POST",
        headers: { cookie: authenticatedCookie, origin: baseUrl },
      });
      assertNoStore(signOut, 302);
      assert.equal(
        new URL(signOut.headers.get("location")!, baseUrl).pathname,
        "/logout",
      );
      const cleared = signOut.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith(`${sessionName}=`));
      assert(cleared && /Max-Age=0/i.test(cleared));
      const replay = await request("/", {
        headers: { cookie: authenticatedCookie },
      });
      assert.equal(replay.headers.get("location"), "/api/logto/sign-in");
      assert.equal(replay.headers.get("cache-control"), "no-store");
    }
    assert(provider.requests.includes("/token"));
    assert(provider.requests.includes("/jwks"));
  },
);

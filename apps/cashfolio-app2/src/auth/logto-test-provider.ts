import { generateKeyPairSync, sign } from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { http } from "msw";
import { setupServer } from "msw/node";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const invalidPrivateKey = generateKeyPairSync("rsa", {
  modulusLength: 2048,
}).privateKey;
export const providerEndpoint = "https://session-identity.example.test";
export const providerConfig = {
  endpoint: providerEndpoint,
  appId: "test-app",
  appSecret: "test-secret",
  scopes: ["email", "profile"],
};

export function makeIdToken(
  expiresInSeconds = 3600,
  sub = "external-1",
  invalidSignature = false,
  audience = "test-app",
) {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", kid: "session-test-key" })}.${encode({ iss: providerEndpoint, aud: audience, sub, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiresInSeconds })}`;
  return `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), invalidSignature ? invalidPrivateKey : privateKey).toString("base64url")}`;
}

/** Real SDK crypto/state verification against an entirely local fake provider. */
export function createTestProvider(
  options: {
    refreshError?: boolean;
    expiresInSeconds?: number;
    unavailable?: boolean;
    jwksUnavailable?: boolean;
    rotateRefreshTokens?: boolean;
    singleUseCodes?: boolean;
    invalidSignature?: boolean;
    invalidAudience?: boolean;
    accountApiUnavailable?: boolean;
    accountApiStatus?: number;
    subject?: string;
    afterTokenExchange?: () => Promise<void>;
  } = {},
) {
  const requests: string[] = [];
  const accountApiAuthorizations: (string | null)[] = [];
  const tokenRequests: {
    grantType: string | null;
    code: string | null;
    refreshToken: string | null;
  }[] = [];
  const refreshTokens = new Set<string>();
  const usedCodes = new Set<string>();
  let tokenSequence = 0;
  const fetch: typeof globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    requests.push(url);
    if (url.endsWith("/.well-known/openid-configuration"))
      return Response.json({
        issuer: providerEndpoint,
        authorization_endpoint: `${providerEndpoint}/authorize`,
        token_endpoint: `${providerEndpoint}/token`,
        jwks_uri: `${providerEndpoint}/jwks`,
        end_session_endpoint: `${providerEndpoint}/logout`,
        revocation_endpoint: `${providerEndpoint}/revoke`,
      });
    if (url.endsWith("/jwks")) {
      if (options.jwksUnavailable)
        return new Response("Unavailable", { status: 503 });
      return Response.json({
        keys: [
          {
            ...publicKey.export({ format: "jwk" }),
            kid: "session-test-key",
            alg: "RS256",
            use: "sig",
          },
        ],
      });
    }
    if (url.endsWith("/token")) {
      const params = new URLSearchParams(
        input instanceof Request ? await input.clone().text() : "",
      );
      const grantType = params.get("grant_type");
      const code = params.get("code");
      const refreshToken = params.get("refresh_token");
      tokenRequests.push({ grantType, code, refreshToken });
      if (options.unavailable)
        return new Response("Unavailable", { status: 503 });
      if (
        options.refreshError ||
        (options.singleUseCodes &&
          grantType === "authorization_code" &&
          (!code || usedCodes.has(code))) ||
        (options.rotateRefreshTokens &&
          grantType === "refresh_token" &&
          (!refreshToken || !refreshTokens.delete(refreshToken)))
      )
        return Response.json(
          { error: "invalid_grant", error_description: "test rejection" },
          { status: 400 },
        );
      if (code) usedCodes.add(code);
      const replacementRefresh = options.rotateRefreshTokens
        ? `test-refresh-${++tokenSequence}`
        : "test-refresh";
      refreshTokens.add(replacementRefresh);
      const response = Response.json({
        access_token: "test-access",
        refresh_token: replacementRefresh,
        id_token: makeIdToken(
          options.expiresInSeconds,
          options.subject,
          options.invalidSignature,
          options.invalidAudience ? "another-app" : "test-app",
        ),
        expires_in: 3600,
        scope: "openid profile email offline_access",
        token_type: "Bearer",
      });
      await options.afterTokenExchange?.();
      return response;
    }
    if (url.endsWith("/api/my-account")) {
      accountApiAuthorizations.push(
        input instanceof Request ? input.headers.get("authorization") : null,
      );
      return options.accountApiUnavailable
        ? Response.error()
        : Response.json(
            { name: "Test User" },
            { status: options.accountApiStatus ?? 200 },
          );
    }
    if (url.endsWith("/revoke")) return new Response(null, { status: 204 });
    throw new Error("Unexpected test identity request");
  };
  const server = setupServer(
    http.all(`${providerEndpoint}/*`, ({ request }) => fetch(request)),
  );
  server.listen({ onUnhandledRequest: "error" });
  syncBuiltinESMExports();
  servers.push(server);
  return { fetch, requests, options, tokenRequests, accountApiAuthorizations };
}

const servers: ReturnType<typeof setupServer>[] = [];
export function closeTestProviders() {
  for (const server of servers.splice(0)) server.close();
  syncBuiltinESMExports();
}

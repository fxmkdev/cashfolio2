import { generateKeyPairSync, sign } from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { http } from "msw";
import { setupServer } from "msw/node";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
export const providerEndpoint = "https://session-identity.example.test";
export const providerConfig = {
  endpoint: providerEndpoint,
  appId: "test-app",
  appSecret: "test-secret",
  scopes: ["email", "profile"],
};

export function makeIdToken(expiresInSeconds = 3600, sub = "external-1") {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", kid: "session-test-key" })}.${encode({ iss: providerEndpoint, aud: "test-app", sub, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiresInSeconds })}`;
  return `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString("base64url")}`;
}

/** Real SDK crypto/state verification against an entirely local fake provider. */
export function createTestProvider(
  options: {
    refreshError?: boolean;
    expiresInSeconds?: number;
    unavailable?: boolean;
  } = {},
) {
  const requests: string[] = [];
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
    if (url.endsWith("/jwks"))
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
    if (url.endsWith("/token")) {
      if (options.unavailable)
        return new Response("Unavailable", { status: 503 });
      if (options.refreshError)
        return Response.json(
          { error: "invalid_grant", error_description: "test rejection" },
          { status: 400 },
        );
      return Response.json({
        access_token: "test-access",
        refresh_token: "test-refresh",
        id_token: makeIdToken(options.expiresInSeconds),
        expires_in: 3600,
        scope: "openid profile email offline_access",
        token_type: "Bearer",
      });
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
  return { fetch, requests, options };
}

const servers: ReturnType<typeof setupServer>[] = [];
export function closeTestProviders() {
  for (const server of servers.splice(0)) server.close();
  syncBuiltinESMExports();
}

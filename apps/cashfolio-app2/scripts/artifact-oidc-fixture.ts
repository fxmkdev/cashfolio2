import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { createServer } from "node:http";
import type { TestContext } from "node:test";

/** A real loopback provider for the separate, unmodified production process. */
export async function startOidcFixture(t: TestContext) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  let endpoint: string;
  const requests: string[] = [];
  const server = createServer((request, response) => {
    request.resume();
    const path = new URL(request.url!, endpoint).pathname;
    requests.push(path);
    response.setHeader("Content-Type", "application/json");
    switch (path) {
      case "/oidc/.well-known/openid-configuration":
        response.end(
          JSON.stringify({
            issuer: endpoint,
            authorization_endpoint: `${endpoint}/authorize`,
            token_endpoint: `${endpoint}/token`,
            jwks_uri: `${endpoint}/jwks`,
            end_session_endpoint: `${endpoint}/logout`,
            revocation_endpoint: `${endpoint}/revoke`,
          }),
        );
        return;
      case "/jwks":
        response.end(
          JSON.stringify({
            keys: [
              {
                ...publicKey.export({ format: "jwk" }),
                kid: "artifact-key",
                alg: "RS256",
                use: "sig",
              },
            ],
          }),
        );
        return;
      case "/token": {
        const encode = (value: object) =>
          Buffer.from(JSON.stringify(value)).toString("base64url");
        const issuedAt = Math.floor(Date.now() / 1000);
        const unsigned = `${encode({ alg: "RS256", kid: "artifact-key" })}.${encode(
          {
            iss: endpoint,
            aud: "artifact-app",
            sub: "artifact-user",
            iat: issuedAt,
            exp: issuedAt + 3600,
          },
        )}`;
        response.end(
          JSON.stringify({
            access_token: "artifact-access",
            refresh_token: "artifact-refresh",
            id_token: `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString("base64url")}`,
            expires_in: 3600,
            scope: "openid profile email offline_access",
            token_type: "Bearer",
          }),
        );
        return;
      }
      case "/revoke":
        response.writeHead(204).end();
        return;
      default:
        response
          .writeHead(404)
          .end(JSON.stringify({ error: `Unexpected OIDC request: ${path}` }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  endpoint = `http://127.0.0.1:${address.port}`;
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  return { endpoint, requests };
}

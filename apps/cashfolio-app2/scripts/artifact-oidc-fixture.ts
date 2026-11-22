import assert from "node:assert/strict";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { createServer } from "node:http";
import type { TestContext } from "node:test";

type FixtureKeys = { privateKey: KeyObject; publicKey: KeyObject };

function createIdToken(endpoint: string, privateKey: KeyObject) {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const issuedAt = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "RS256", kid: "artifact-key" })}.${encode({
    iss: endpoint,
    aud: "artifact-app",
    sub: "artifact-user",
    iat: issuedAt,
    exp: issuedAt + 3600,
  })}`;
  return `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString("base64url")}`;
}

function oidcResponse(
  path: string,
  endpoint: string,
  keys: FixtureKeys,
): {
  status: number;
  body?: object;
} {
  switch (path) {
    case "/oidc/.well-known/openid-configuration":
      return {
        status: 200,
        body: {
          issuer: endpoint,
          authorization_endpoint: `${endpoint}/authorize`,
          token_endpoint: `${endpoint}/token`,
          jwks_uri: `${endpoint}/jwks`,
          end_session_endpoint: `${endpoint}/logout`,
          revocation_endpoint: `${endpoint}/revoke`,
        },
      };
    case "/jwks":
      return {
        status: 200,
        body: {
          keys: [
            {
              ...keys.publicKey.export({ format: "jwk" }),
              kid: "artifact-key",
              alg: "RS256",
              use: "sig",
            },
          ],
        },
      };
    case "/token":
      return {
        status: 200,
        body: {
          access_token: "artifact-access",
          refresh_token: "artifact-refresh",
          id_token: createIdToken(endpoint, keys.privateKey),
          expires_in: 3600,
          scope: "openid profile email offline_access",
          token_type: "Bearer",
        },
      };
    case "/revoke":
      return { status: 204 };
    default:
      return {
        status: 404,
        body: { error: `Unexpected OIDC request: ${path}` },
      };
  }
}

/** A real loopback provider for the separate, unmodified production process. */
export async function startOidcFixture(t: TestContext) {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  let endpoint: string;
  const requests: string[] = [];
  const server = createServer((request, response) => {
    request.resume();
    const path = new URL(request.url!, endpoint).pathname;
    requests.push(path);
    const result = oidcResponse(path, endpoint, keys);
    response.writeHead(result.status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result.body));
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

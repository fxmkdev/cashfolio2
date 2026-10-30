import type { LogtoContext } from "@logto/node";
import { getCookie } from "@tanstack/react-start/server";
import { E2E_AUTH_EXTERNAL_ID_COOKIE } from "./auth-cookie";

export function getE2EAuthenticationContext(): LogtoContext | null {
  const externalId =
    getCookie(E2E_AUTH_EXTERNAL_ID_COOKIE) ??
    process.env.E2E_AUTH_EXTERNAL_ID ??
    "e2e-user";
  if (!externalId) return null;
  return {
    isAuthenticated: true,
    claims: {
      sub: externalId,
      name: "E2E User",
      email: `${externalId}@example.test`,
    },
  } as LogtoContext;
}

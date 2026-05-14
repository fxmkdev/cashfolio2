import { redirect } from "@tanstack/react-router";
import { getCookie } from "@tanstack/react-start/server";
import type { LogtoContext } from "@logto/node";
import { E2E_AUTH_EXTERNAL_ID_COOKIE } from "./e2e-auth";

function getE2EBypassExternalId(): string | null {
  const bypassRequested = process.env.E2E_AUTH_BYPASS === "true";
  const testModeEnabled = process.env.E2E_TEST_MODE === "true";

  if (!bypassRequested || !testModeEnabled) {
    return null;
  }

  return (
    getCookie(E2E_AUTH_EXTERNAL_ID_COOKIE) ??
    process.env.E2E_AUTH_EXTERNAL_ID ??
    "e2e-user"
  );
}

export async function ensureAuthenticated() {
  const e2eExternalId = getE2EBypassExternalId();

  if (e2eExternalId) {
    return {
      isAuthenticated: true,
      claims: { sub: e2eExternalId },
    } as LogtoContext;
  }

  const { getLogtoContext } = await import("./logto.server");
  const context = await getLogtoContext({ getAccessToken: false });

  if (!context.isAuthenticated) {
    throw redirect({ href: "/api/logto/sign-in", reloadDocument: true });
  }

  return context;
}

import { redirect } from "@tanstack/react-router";
import type { LogtoContext } from "@logto/node";

function getE2EBypassExternalId(): string | null {
  if (process.env.E2E_AUTH_BYPASS !== "true") {
    return null;
  }

  return process.env.E2E_AUTH_EXTERNAL_ID ?? "e2e-user";
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

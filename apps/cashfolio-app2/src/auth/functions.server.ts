import { redirect } from "@tanstack/react-router";
export async function getAuthenticationContext() {
  if (__E2E_BUILD__) {
    const { getE2EAuthenticationContext } = await import("../e2e/auth.server");
    const context = getE2EAuthenticationContext();
    if (context) return context;
  }

  const { getLogtoContext } = await import("./logto.server");
  return getLogtoContext({ getAccessToken: false });
}

export async function ensureAuthenticated() {
  const context = await getAuthenticationContext();

  if (!context.isAuthenticated) {
    throw redirect({ href: "/api/logto/sign-in", reloadDocument: true });
  }

  return context;
}

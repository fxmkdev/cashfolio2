import { redirect } from "@tanstack/react-router";
export async function getAuthenticationContext(options?: {
  allowDeletionPending?: boolean;
}) {
  if (__E2E_BUILD__) {
    const { getE2EAuthenticationContext } = await import("../e2e/auth.server");
    const context = getE2EAuthenticationContext();
    if (context) return context;
  }

  const { getLogtoContext } = await import("./logto.server");
  return options
    ? getLogtoContext({ getAccessToken: false }, options)
    : getLogtoContext({ getAccessToken: false });
}

export async function ensureAuthenticated(options?: {
  allowDeletionPending?: boolean;
}) {
  const context = await getAuthenticationContext(options);

  if (!context.isAuthenticated) {
    throw redirect({ href: "/api/logto/sign-in", reloadDocument: true });
  }

  return context;
}

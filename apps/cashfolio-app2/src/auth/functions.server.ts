import { redirect } from "@tanstack/react-router";
import { getLogtoContext } from "./logto.server";

export async function ensureAuthenticated() {
  const context = await getLogtoContext({ getAccessToken: false });

  if (!context.isAuthenticated) {
    throw redirect({ href: "/api/logto/sign-in", reloadDocument: true });
  }

  return context;
}

import { createServerFn } from "@tanstack/react-start";
import { ensureAuthenticated } from "@/auth/functions.server";
import {
  resolveAuthenticatedUserProfile,
  type AuthenticatedUserProfile,
} from "@/auth/user-profile";

export const getAuthenticatedUserProfile = createServerFn({
  method: "GET",
}).handler(async (): Promise<AuthenticatedUserProfile> => {
  const context = await ensureAuthenticated();
  return resolveAuthenticatedUserProfile(context.claims);
});

import { createServerFn } from "@tanstack/react-start";

export const getAuthenticationStatus = createServerFn({
  method: "GET",
}).handler(async () => {
  const [{ getAuthenticationContext }, { setResponseHeader }] =
    await Promise.all([
      import("@/auth/functions.server"),
      import("@tanstack/react-start/server"),
    ]);
  setResponseHeader("Cache-Control", "no-store");

  const context = await getAuthenticationContext();
  return context.isAuthenticated;
});

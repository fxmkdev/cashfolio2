import { createServerFn } from "@tanstack/react-start";

export const getRuntimeAppVersion = createServerFn({
  method: "GET",
}).handler(async () => {
  const { getAppVersion } = await import("./app-version.server");

  return getAppVersion();
});

import { createFileRoute, redirect } from "@tanstack/react-router";
import { getHomeRedirectTarget } from "./-home-redirect";

export const Route = createFileRoute("/")({
  loader: async () => {
    const { getFirstUserAccountBookId } = await import("../server/home");
    const accountBookId = await getFirstUserAccountBookId();
    throw redirect(getHomeRedirectTarget(accountBookId));
  },
});

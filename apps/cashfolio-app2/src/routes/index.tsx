import { createFileRoute, redirect } from "@tanstack/react-router";
import { getFirstUserAccountBookId } from "../server/home";
import { getHomeRedirectTarget } from "./-home-redirect";

export const Route = createFileRoute("/")({
  loader: async () => {
    const accountBookId = await getFirstUserAccountBookId();
    throw redirect(getHomeRedirectTarget(accountBookId));
  },
});

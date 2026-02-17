import { createFileRoute } from "@tanstack/react-router";
import {
  handleLogtoSignIn,
  handleLogtoSignInCallback,
  handleLogtoSignOut,
  handleLogtoSignUp,
} from "../../../auth/logto.server";

export const Route = createFileRoute("/api/logto/$action")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        switch (params.action) {
          case "sign-in":
            return handleLogtoSignIn();
          case "callback":
            return handleLogtoSignInCallback(request);
          case "sign-out":
            return handleLogtoSignOut();
          case "sign-up":
            return handleLogtoSignUp();
          default:
            return new Response("Not Found", { status: 404 });
        }
      },
    },
  },
});

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
          case "sign-up":
            return handleLogtoSignUp();
          case "sign-out":
            return new Response("Method Not Allowed", {
              status: 405,
              headers: { Allow: "POST" },
            });
          default:
            return new Response("Not Found", { status: 404 });
        }
      },
      POST: async ({ request, params }) => {
        switch (params.action) {
          case "sign-out":
            return handleLogtoSignOut(request);
          default:
            return new Response("Not Found", { status: 404 });
        }
      },
    },
  },
});

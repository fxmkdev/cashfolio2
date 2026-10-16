import { createFileRoute, redirect } from "@tanstack/react-router";

// Compatibility for existing Logto Account Center deletion URLs.
export const Route = createFileRoute("/account/delete")({
  validateSearch: (search: Record<string, unknown>) => ({
    deleted: search.deleted === "1" || search.deleted === 1 ? "1" : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/user/delete", search: { deleted: search.deleted } });
  },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleUserDeletionRequest } =
          await import("@/server/user-deletion");
        return handleUserDeletionRequest(request);
      },
    },
  },
});

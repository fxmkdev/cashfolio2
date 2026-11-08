import { createFileRoute } from "@tanstack/react-router";
import { createDocumentTitleHead } from "@/shared/navigation/document-title";
import { UserDeletePageView } from "./-delete-page-view";

type UserDeleteSearch = {
  deleted?: string;
};

export const Route = createFileRoute("/user/delete")({
  validateSearch: (search: Record<string, unknown>): UserDeleteSearch => ({
    deleted: search.deleted === "1" || search.deleted === 1 ? "1" : undefined,
  }),
  loaderDeps: ({ search }) => ({ deleted: search.deleted }),
  loader: async ({ deps }) => {
    if (deps.deleted === "1") {
      return {
        deleted: true,
        preview: null,
      };
    }

    const { getUserDeletionPreview } = await import("@/server/user-deletion");

    return {
      deleted: false,
      preview: await getUserDeletionPreview(),
    };
  },
  head: () => createDocumentTitleHead("Delete Your Cashfolio Account"),
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleUserDeletionRequest } =
          await import("@/server/user-deletion");
        return handleUserDeletionRequest(request);
      },
    },
  },
  component: UserDeletePage,
});

function UserDeletePage() {
  return <UserDeletePageView {...Route.useLoaderData()} />;
}

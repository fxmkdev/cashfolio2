import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { createDocumentTitleHead } from "@/shared/document-title";

const AdminUsersPageView = lazy(async () => {
  const module = await import("./-users-page-view");
  return { default: module.AdminUsersPageView };
});

export const Route = createFileRoute("/admin/users")({
  loader: async () => {
    const { getAdminUsers } = await import("@/server/admin-users");
    return getAdminUsers();
  },
  head: () => createDocumentTitleHead("Users"),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const users = Route.useLoaderData();
  const router = useRouter();

  return (
    <Suspense fallback={null}>
      <AdminUsersPageView
        users={users}
        onSubmitRoles={async ({ userId, roles }) => {
          const { updateAdminUserRoles } = await import("@/server/admin-users");
          await updateAdminUserRoles({
            data: {
              userId,
              roles,
            },
          });
          await router.invalidate();
        }}
        onDeleteUser={async ({ userId, confirmation }) => {
          const { deleteAdminUser } = await import("@/server/admin-users");
          try {
            await deleteAdminUser({ data: { userId, confirmation } });
          } finally {
            await router.invalidate().catch((error) => {
              console.warn(
                "Failed to refresh Admin Users after user deletion.",
                { error },
              );
            });
          }
        }}
      />
    </Suspense>
  );
}

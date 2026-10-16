import { createFileRoute, Outlet } from "@tanstack/react-router";
import { UserLocaleProvider } from "@/user-locale-context";
import { AdminShell } from "./-admin-shell";
import { AdminRouteErrorComponent } from "./-route-error";

export const Route = createFileRoute("/admin")({
  loader: async () => {
    const [
      { ensureAdminAccess },
      { getRuntimeAppVersion },
      {
        getAuthenticatedUserLocale,
        getAuthenticatedUserProfile,
        getUserSecurityUrl,
      },
    ] = await Promise.all([
      import("@/server/admin-users"),
      import("@/server/app-version"),
      import("@/server/user-profile"),
    ]);

    await ensureAdminAccess();

    const [appVersion, userProfile, userSecurityUrl, userLocale] =
      await Promise.all([
        getRuntimeAppVersion(),
        getAuthenticatedUserProfile(),
        getUserSecurityUrl(),
        getAuthenticatedUserLocale(),
      ]);

    return {
      appVersion,
      userProfile,
      userSecurityUrl,
      userLocale,
    };
  },
  errorComponent: AdminRouteErrorComponent,
  component: AdminLayout,
});

function AdminLayout() {
  const { appVersion, userProfile, userSecurityUrl, userLocale } =
    Route.useLoaderData();

  return (
    <UserLocaleProvider locale={userLocale}>
      <AdminShell
        userSecurityUrl={userSecurityUrl}
        appVersion={appVersion}
        userProfile={userProfile}
      >
        <Outlet />
      </AdminShell>
    </UserLocaleProvider>
  );
}

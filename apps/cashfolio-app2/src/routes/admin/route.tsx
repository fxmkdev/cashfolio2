import { createFileRoute, Outlet } from "@tanstack/react-router";
import { UserLocaleProvider } from "@/user-locale-context";
import { AdminShell } from "./-admin-shell";

export const Route = createFileRoute("/admin")({
  loader: async () => {
    const [
      { getRuntimeAppVersion },
      {
        getAuthenticatedUserLocale,
        getAuthenticatedUserProfile,
        getUserAccountSecurityUrl,
      },
    ] = await Promise.all([
      import("@/server/app-version"),
      import("@/server/user-profile"),
    ]);

    const [appVersion, userProfile, accountSecurityUrl, userLocale] =
      await Promise.all([
        getRuntimeAppVersion(),
        getAuthenticatedUserProfile(),
        getUserAccountSecurityUrl(),
        getAuthenticatedUserLocale(),
      ]);

    return {
      appVersion,
      userProfile,
      accountSecurityUrl,
      userLocale,
    };
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { appVersion, userProfile, accountSecurityUrl, userLocale } =
    Route.useLoaderData();

  return (
    <UserLocaleProvider locale={userLocale}>
      <AdminShell
        accountSecurityUrl={accountSecurityUrl}
        appVersion={appVersion}
        userProfile={userProfile}
      >
        <Outlet />
      </AdminShell>
    </UserLocaleProvider>
  );
}

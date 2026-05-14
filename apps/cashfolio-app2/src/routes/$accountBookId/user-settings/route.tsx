import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { updateAuthenticatedUserSettings } from "@/server/user-profile";

const UserSettingsPageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.UserSettingsPageView };
});

export const Route = createFileRoute("/$accountBookId/user-settings")({
  loader: async () => {
    // Keep Account API server functions out of the initial client bundle.
    const { loadUserSettingsPageData } = await import("./-page-loader");
    return loadUserSettingsPageData();
  },
  component: UserSettingsPage,
});

function UserSettingsPage() {
  const settings = Route.useLoaderData();
  const router = useRouter();

  return (
    <Suspense fallback={null}>
      <UserSettingsPageView
        settings={settings}
        onSubmit={async (values) => {
          await updateAuthenticatedUserSettings({
            data: {
              name: values.name,
              avatarUrl: values.avatarUrl,
            },
          });
          await router.invalidate();
        }}
      />
    </Suspense>
  );
}

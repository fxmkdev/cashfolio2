import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { createDocumentTitleHead } from "@/shared/document-title";

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
  head: () => createDocumentTitleHead("User Settings"),
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
          const { updateAuthenticatedUserSettings } =
            await import("@/server/user-profile");
          await updateAuthenticatedUserSettings({
            data: {
              name: values.name,
              avatarUrl: values.avatarUrl,
              locale: values.locale,
            },
          });
          await router.invalidate();
        }}
      />
    </Suspense>
  );
}

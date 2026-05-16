import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Suspense, lazy, useMemo } from "react";
import { createDocumentTitleHead } from "@/shared/document-title";
import { UserLocaleProvider } from "@/user-locale-context";
import {
  parseUserSettingsSearch,
  resolveUserSettingsReturnTarget,
} from "./-user-settings/-return-target";

const UserSettingsPageView = lazy(async () => {
  const module = await import("./-user-settings/-page-view");
  return { default: module.UserSettingsPageView };
});

export const Route = createFileRoute("/user-settings")({
  validateSearch: parseUserSettingsSearch,
  loader: async () => {
    const [
      { getUserAccountBooks },
      { getAuthenticatedUserLocale },
      { loadUserSettingsPageData },
    ] = await Promise.all([
      import("@/server/home"),
      import("@/server/user-profile"),
      import("./-user-settings/-page-loader"),
    ]);

    const [accountBooks, settings, userLocale] = await Promise.all([
      getUserAccountBooks(),
      loadUserSettingsPageData(),
      getAuthenticatedUserLocale(),
    ]);

    return {
      accountBooks,
      settings,
      userLocale,
    };
  },
  head: () => createDocumentTitleHead("User Settings"),
  component: UserSettingsPage,
});

function UserSettingsPage() {
  const { accountBooks, settings, userLocale } = Route.useLoaderData();
  const { returnTo } = Route.useSearch();
  const router = useRouter();
  const returnTarget = useMemo(
    () => resolveUserSettingsReturnTarget({ accountBooks, returnTo }),
    [accountBooks, returnTo],
  );

  return (
    <UserLocaleProvider locale={userLocale}>
      <Suspense fallback={null}>
        <UserSettingsPageView
          returnTarget={returnTarget}
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
    </UserLocaleProvider>
  );
}

import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useRefreshedMutationData } from "@/hooks/use-refreshed-mutation-data";
import { loadSettingsPageData } from "./-page-loader";
import { Suspense, lazy } from "react";
import { createDocumentTitleHead } from "@/shared/document-title";
import { invalidateCachedUserAccountBooks } from "@/account-books/options";

const SettingsPageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.SettingsPageView };
});

export const Route = createFileRoute("/$accountBookId/settings/")({
  loader: async ({ params: { accountBookId } }) => {
    const { loadSettingsPageData } = await import("./-page-loader");
    return loadSettingsPageData({ accountBookId });
  },
  head: () => createDocumentTitleHead("Settings"),
  component: SettingsPage,
});

function SettingsPage() {
  const sourceSettings = Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const { data: settings, refresh: onRefreshConstraints } =
    useRefreshedMutationData(sourceSettings, () =>
      loadSettingsPageData({ accountBookId }),
    );
  const router = useRouter();

  return (
    <Suspense fallback={null}>
      <SettingsPageView
        key={accountBookId}
        accountBookId={accountBookId}
        settings={settings}
        onRefreshConstraints={onRefreshConstraints}
        onSubmit={async (values) => {
          const { updateAccountBookSettings } =
            await import("@/server/account-books");

          await updateAccountBookSettings({
            data: {
              accountBookId,
              name: values.name,
              referenceCurrency: values.referenceCurrency,
              startDate: values.startDate,
            },
          });

          invalidateCachedUserAccountBooks();
          await router.invalidate();
        }}
      />
    </Suspense>
  );
}

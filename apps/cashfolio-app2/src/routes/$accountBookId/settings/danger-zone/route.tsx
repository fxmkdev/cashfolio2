import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { useRefreshedMutationData } from "@/hooks/use-refreshed-mutation-data";
import { getAccountBookSettings } from "@/server/account-books";
import { createDocumentTitleHead } from "@/shared/document-title";
import { invalidateCachedUserAccountBooks } from "../../-account-book-options-loader";

const DangerZonePageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.DangerZonePageView };
});

export const Route = createFileRoute("/$accountBookId/settings/danger-zone")({
  loader: ({ params: { accountBookId } }) =>
    getAccountBookSettings({ data: { accountBookId } }),
  head: () => createDocumentTitleHead("Danger Zone"),
  component: DangerZonePage,
});

function DangerZonePage() {
  const sourceSettings = Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const { data: settings, refresh: onRefreshConstraints } =
    useRefreshedMutationData(sourceSettings, () =>
      getAccountBookSettings({ data: { accountBookId } }),
    );
  const navigate = useNavigate({
    from: "/$accountBookId/settings/danger-zone",
  });

  return (
    <Suspense fallback={null}>
      <DangerZonePageView
        key={accountBookId}
        accountBookName={settings.name}
        onRefreshConstraints={onRefreshConstraints}
        onDelete={async (values) => {
          const { deleteAccountBook } = await import("@/server/account-books");

          await deleteAccountBook({
            data: { accountBookId, confirmationName: values.confirmationName },
          });

          invalidateCachedUserAccountBooks();
          await navigate({ to: "/" });
        }}
      />
    </Suspense>
  );
}

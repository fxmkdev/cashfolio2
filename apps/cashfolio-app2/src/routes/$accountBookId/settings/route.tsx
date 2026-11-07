import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { SettingsNavigation } from "./-settings-navigation";
import { PageShell } from "@/components/layout/page-shell";
import { getAccountBookSettings } from "@/server/account-books";
import { useRefreshedMutationData } from "@/hooks/use-refreshed-mutation-data";
import { SettingsActions } from "./-settings-actions";
import { invalidateCachedUserAccountBooks } from "@/account-books/options";

export const Route = createFileRoute("/$accountBookId/settings")({
  loader: ({ params: { accountBookId } }) =>
    getAccountBookSettings({ data: { accountBookId } }),
  component: SettingsLayout,
});

function SettingsLayout() {
  const { accountBookId } = Route.useParams();
  const sourceSettings = Route.useLoaderData();
  const { data: settings, refresh: onRefreshConstraints } =
    useRefreshedMutationData(sourceSettings, () =>
      getAccountBookSettings({ data: { accountBookId } }),
    );
  const navigate = useNavigate({ from: "/$accountBookId/settings" });
  const categories = useRouterState({
    select: (state) =>
      state.location.pathname.startsWith(
        `/${accountBookId}/settings/categories`,
      ),
  });
  const classifications = useRouterState({
    select: (state) =>
      state.location.pathname.startsWith(
        `/${accountBookId}/settings/classifications`,
      ),
  });
  return (
    <PageShell>
      <SettingsNavigation
        accountBookId={accountBookId}
        categories={categories}
        classifications={classifications}
        actions={
          <SettingsActions
            key={accountBookId}
            accountBookName={settings.name}
            onRefreshConstraints={onRefreshConstraints}
            onDelete={async (values) => {
              const { deleteAccountBook } =
                await import("@/server/account-books");
              await deleteAccountBook({
                data: {
                  accountBookId,
                  confirmationName: values.confirmationName,
                },
              });
              invalidateCachedUserAccountBooks();
              await navigate({ to: "/" });
            }}
          />
        }
      />
      <Outlet />
    </PageShell>
  );
}

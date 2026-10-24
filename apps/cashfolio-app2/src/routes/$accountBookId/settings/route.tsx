import {
  createFileRoute,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { SettingsNavigation } from "./-settings-navigation";
import { PageShell } from "@/components/layout/page-shell";

export const Route = createFileRoute("/$accountBookId/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  const { accountBookId } = Route.useParams();
  const categories = useRouterState({
    select: (state) =>
      state.location.pathname.startsWith(
        `/${accountBookId}/settings/categories`,
      ),
  });
  return (
    <PageShell>
      <SettingsNavigation
        accountBookId={accountBookId}
        categories={categories}
      />
      <Outlet />
    </PageShell>
  );
}

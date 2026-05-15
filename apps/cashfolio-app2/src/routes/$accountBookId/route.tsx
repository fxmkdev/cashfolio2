import {
  createFileRoute,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { AccountBookShell } from "./-account-book-shell";
import {
  getAccountsLinkSearch,
  getPeriodLinkSearch,
  hasLedgerAccountLoaderData,
} from "./-route-helpers";

export const Route = createFileRoute("/$accountBookId")({
  loader: async () => {
    const [
      { loadUserAccountBooksForAccountBookRoute },
      { getRuntimeAppVersion },
      { getAuthenticatedUserProfile, getUserAccountSecurityUrl },
    ] = await Promise.all([
      import("./-account-book-options-loader"),
      import("@/server/app-version"),
      import("@/server/user-profile"),
    ]);

    const [accountBooks, appVersion, userProfile, accountSecurityUrl] =
      await Promise.all([
        loadUserAccountBooksForAccountBookRoute(),
        getRuntimeAppVersion(),
        getAuthenticatedUserProfile(),
        getUserAccountSecurityUrl(),
      ]);

    return { accountBooks, appVersion, userProfile, accountSecurityUrl };
  },
  component: AccountBookLayout,
});

function AccountBookLayout() {
  const { accountBooks, appVersion, userProfile, accountSecurityUrl } =
    Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const { href, pathname, locationSearch, matches } = useRouterState({
    select: (state) => ({
      href: state.location.href,
      pathname: state.location.pathname,
      locationSearch: state.location.search as Record<string, unknown>,
      matches: state.matches.map((match) => ({
        routeId: match.routeId,
        account: hasLedgerAccountLoaderData(match.loaderData)
          ? match.loaderData.account
          : null,
      })),
    }),
  });

  return (
    <AccountBookShell
      accountBookId={accountBookId}
      currentHref={href}
      pathname={pathname}
      accountBooks={accountBooks}
      appVersion={appVersion}
      userProfile={userProfile}
      accountSecurityUrl={accountSecurityUrl}
      accountsLinkSearch={getAccountsLinkSearch({
        locationSearch,
        matches,
      })}
      periodLinkSearch={getPeriodLinkSearch(locationSearch)}
    >
      <Outlet />
    </AccountBookShell>
  );
}

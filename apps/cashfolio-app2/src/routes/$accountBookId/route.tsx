import {
  createFileRoute,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { AccountBookShell } from "./-account-book-shell";
import { UserLocaleProvider } from "@/user-locale-context";
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
      {
        getAuthenticatedUserLocale,
        getAuthenticatedUserProfile,
        getUserAccountSecurityUrl,
      },
      { getCurrentUserCanAccessAdmin },
    ] = await Promise.all([
      import("./-account-book-options-loader"),
      import("@/server/app-version"),
      import("@/server/user-profile"),
      import("@/server/admin-users"),
    ]);

    const [
      accountBooks,
      appVersion,
      userProfile,
      accountSecurityUrl,
      userLocale,
      canAccessAdmin,
    ] = await Promise.all([
      loadUserAccountBooksForAccountBookRoute(),
      getRuntimeAppVersion(),
      getAuthenticatedUserProfile(),
      getUserAccountSecurityUrl(),
      getAuthenticatedUserLocale(),
      getCurrentUserCanAccessAdmin(),
    ]);

    return {
      accountBooks,
      appVersion,
      userProfile,
      accountSecurityUrl,
      userLocale,
      canAccessAdmin,
    };
  },
  component: AccountBookLayout,
});

function AccountBookLayout() {
  const {
    accountBooks,
    appVersion,
    userProfile,
    accountSecurityUrl,
    userLocale,
    canAccessAdmin,
  } = Route.useLoaderData();
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
    <UserLocaleProvider locale={userLocale}>
      <AccountBookShell
        accountBookId={accountBookId}
        canAccessAdmin={canAccessAdmin}
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
    </UserLocaleProvider>
  );
}

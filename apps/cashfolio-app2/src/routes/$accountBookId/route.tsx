import { AssetClassContext } from "@/classification-context";
import { getAssetClasses } from "@/server/classifications";
import {
  createFileRoute,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { AccountBookShell } from "./-account-book-shell";
import { UserLocaleProvider } from "@/user-locale-context";
import {
  getActiveSection,
  getAccountsLinkSearch,
  getPeriodLinkSearch,
  hasLedgerAccountLoaderData,
} from "./-route-helpers";

export const Route = createFileRoute("/$accountBookId")({
  loader: async ({ params: { accountBookId } }) => {
    const [
      { loadUserAccountBooksForAccountBookRoute },
      { getRuntimeAppVersion },
      {
        getAuthenticatedUserLocale,
        getAuthenticatedUserProfile,
        getUserSecurityUrl,
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
      userSecurityUrl,
      userLocale,
      canAccessAdmin,
    ] = await Promise.all([
      loadUserAccountBooksForAccountBookRoute(),
      getRuntimeAppVersion(),
      getAuthenticatedUserProfile(),
      getUserSecurityUrl(),
      getAuthenticatedUserLocale(),
      getCurrentUserCanAccessAdmin(),
    ]);

    const assetClasses = await getAssetClasses({ data: { accountBookId } });
    return {
      assetClasses,
      accountBooks,
      appVersion,
      userProfile,
      userSecurityUrl,
      userLocale,
      canAccessAdmin,
    };
  },
  component: AccountBookLayout,
});

function AccountBookLayout() {
  const {
    assetClasses,
    accountBooks,
    appVersion,
    userProfile,
    userSecurityUrl,
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
    <AssetClassContext.Provider value={assetClasses}>
      <UserLocaleProvider locale={userLocale}>
        <AccountBookShell
          accountBookId={accountBookId}
          canAccessAdmin={canAccessAdmin}
          currentHref={href}
          pathname={pathname}
          activeSection={getActiveSection({ pathname, accountBookId, matches })}
          accountBooks={accountBooks}
          appVersion={appVersion}
          userProfile={userProfile}
          userSecurityUrl={userSecurityUrl}
          accountsLinkSearch={getAccountsLinkSearch({
            locationSearch,
            matches,
          })}
          periodLinkSearch={getPeriodLinkSearch(locationSearch)}
        >
          <Outlet />
        </AccountBookShell>
      </UserLocaleProvider>
    </AssetClassContext.Provider>
  );
}

import type { Preview } from "@storybook/react-vite";
import { themes } from "storybook/theming";
import {
  AllEnterpriseModule as GridAllEnterpriseModule,
  ModuleRegistry as GridModuleRegistry,
} from "ag-grid-enterprise";
import { MantineProvider } from "@mantine/core";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import "../src/mantine";
import { theme } from "../src/theme";

type RouterStoryParameters = {
  router?: {
    initialPath?: string;
  };
};

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: {
      // Docs theme does not adapt to system theme out of the box.
      theme: themes[getPreferredColorScheme()],
    },
  },
  decorators: [
    (Story, context) => {
      const { router: routerParameters } =
        context.parameters as RouterStoryParameters;
      const initialPath = routerParameters?.initialPath ?? "/";
      const rootRoute = createRootRoute({
        component: () => <Outlet />,
      });

      const rootStoryRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/",
        component: () => <Story />,
      });

      const accountBookRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/$accountBookId",
        component: () => <Outlet />,
      });
      const accountBookIndexRoute = createRoute({
        getParentRoute: () => accountBookRoute,
        path: "/",
        component: () => {
          const { accountBookId } = accountBookRoute.useParams();

          return (
            <Navigate
              to="/$accountBookId/accounts"
              params={{ accountBookId }}
              search={{ tab: "ASSET", mode: "active" }}
              replace
            />
          );
        },
      });

      const accountBookAccountsRoute = createRoute({
        getParentRoute: () => accountBookRoute,
        path: "/accounts",
        component: () => <Story />,
      });
      const accountBookTransactionsRoute = createRoute({
        getParentRoute: () => accountBookRoute,
        path: "/transactions",
        component: () => <Story />,
      });
      const accountBookReportRoute = createRoute({
        getParentRoute: () => accountBookRoute,
        path: "/report",
        component: () => <Story />,
      });
      const accountBookHistoryRoute = createRoute({
        getParentRoute: () => accountBookRoute,
        path: "/history",
        component: () => <Story />,
      });

      const accountBookPeriodRoute = createRoute({
        getParentRoute: () => accountBookRoute,
        path: "/period",
        component: () => <Story />,
      });
      const accountBookTimelineRoute = createRoute({
        getParentRoute: () => accountBookRoute,
        path: "/timeline",
        component: () => <Story />,
      });
      const accountBookSettingsRoute = createRoute({
        getParentRoute: () => accountBookRoute,
        path: "/settings",
        component: () => <Story />,
      });
      const accountBookUserSettingsRoute = createRoute({
        getParentRoute: () => accountBookRoute,
        path: "/user-settings",
        component: () => <Story />,
      });
      const accountBookValuationCacheRoute = createRoute({
        getParentRoute: () => accountBookRoute,
        path: "/valuation-cache",
        component: () => <Story />,
      });

      const accountLedgerRoute = createRoute({
        getParentRoute: () => accountBookRoute,
        path: "/$accountId",
        component: () => <Outlet />,
      });

      const accountLedgerIndexRoute = createRoute({
        getParentRoute: () => accountLedgerRoute,
        path: "/",
        component: () => <Story />,
      });

      const accountLedgerChartRoute = createRoute({
        getParentRoute: () => accountLedgerRoute,
        path: "/chart",
        component: () => <Story />,
      });

      const accountLedgerRouteTree = accountLedgerRoute.addChildren([
        accountLedgerIndexRoute,
        accountLedgerChartRoute,
      ]);

      const adminRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/admin",
        component: () => <Story />,
      });
      const adminValuationCacheRoute = createRoute({
        getParentRoute: () => adminRoute,
        path: "/valuation-cache",
        component: () => <Story />,
      });
      const adminUsersRoute = createRoute({
        getParentRoute: () => adminRoute,
        path: "/users",
        component: () => <Story />,
      });
      const adminRouteTree = adminRoute.addChildren([
        adminValuationCacheRoute,
        adminUsersRoute,
      ]);

      const userSettingsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/user-settings",
        component: () => <Story />,
      });

      const accountBookRouteTree = accountBookRoute.addChildren([
        accountBookIndexRoute,
        accountBookAccountsRoute,
        accountBookTransactionsRoute,
        accountBookReportRoute,
        accountBookHistoryRoute,
        accountBookPeriodRoute,
        accountBookTimelineRoute,
        accountBookSettingsRoute,
        accountBookUserSettingsRoute,
        accountBookValuationCacheRoute,
        accountLedgerRouteTree,
      ]);

      const router = createRouter({
        routeTree: rootRoute.addChildren([
          rootStoryRoute,
          adminRouteTree,
          userSettingsRoute,
          accountBookRouteTree,
        ]),
        history: createMemoryHistory({
          initialEntries: [initialPath],
        }),
      });

      return (
        <div data-ag-theme-mode={getPreferredColorScheme()}>
          <MantineProvider theme={theme} defaultColorScheme="auto">
            <RouterProvider router={router} />
          </MantineProvider>
        </div>
      );
    },
  ],
};

GridModuleRegistry.registerModules([GridAllEnterpriseModule]);

export default preview;

function getPreferredColorScheme() {
  if (typeof window === "undefined" || !window.matchMedia) return "light";

  const isDarkThemePreferred = window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches;
  if (isDarkThemePreferred) return "dark";

  return "light";
}

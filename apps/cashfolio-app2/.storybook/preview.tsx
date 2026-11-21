import type { IndexEntry } from "storybook/internal/types";
import type { Preview } from "@storybook/react-vite";
import { createContext, useContext, type ComponentType } from "react";
import { themes } from "storybook/theming";
import { ensureGridModulesRegistered } from "../src/ag-grid-modules";
import { MantineProvider, Text } from "@mantine/core";
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
import { GlobalLoadingProvider } from "../src/components/navigation/global-loading";
import { UserLocaleProvider } from "../src/user-locale-context";
import {
  DEFAULT_USER_LOCALE,
  USER_LOCALE_OPTIONS,
  normalizeUserLocaleInput,
} from "../src/user-locale";

type RouterStoryParameters = {
  colorScheme?: "light" | "dark";
  manualSetup?: string;
  router?: {
    initialPath?: string;
  };
};

const StoryContext = createContext<ComponentType>(() => null);

function StoryFromContext() {
  const Story = useContext(StoryContext);
  return <Story />;
}

const preview: Preview & {
  parameters: {
    options: { storySort: (a: IndexEntry, b: IndexEntry) => number };
  };
} = {
  globalTypes: {
    colorScheme: {
      description:
        "App color scheme (explicit story overrides take precedence)",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        dynamicTitle: true,
        items: ["light", "dark"],
      },
    },
    locale: {
      description:
        "User locale (explicit component locale props take precedence)",
      toolbar: {
        title: "Locale",
        icon: "globe",
        dynamicTitle: true,
        items: USER_LOCALE_OPTIONS.map(({ value, label }) => ({
          value,
          title: label,
        })),
      },
    },
  },
  initialGlobals: {
    colorScheme: "light",
    locale: DEFAULT_USER_LOCALE,
    viewport: { value: "cashfolioDesktop", isRotated: false },
  },
  parameters: {
    layout: "padded",
    options: {
      // Storybook evaluates this function's source as JavaScript during indexing.
      storySort: (a, b) => {
        const roots = ["Start Here", "Components", "Screens"];
        const priority = ["Docs", "Overview", "Default", "Create", "Edit"];
        const left = [...a.title.split("/"), a.name];
        const right = [...b.title.split("/"), b.name];
        for (
          let index = 0;
          index < Math.max(left.length, right.length);
          index++
        ) {
          const x = left[index] ?? "";
          const y = right[index] ?? "";
          if (x === y) continue;
          const order = index === 0 ? roots : priority;
          const xRank = order.includes(x) ? order.indexOf(x) : order.length;
          const yRank = order.includes(y) ? order.indexOf(y) : order.length;
          return (
            xRank - yRank || x.localeCompare(y, undefined, { numeric: true })
          );
        }
        return 0;
      },
    },
    viewport: {
      options: {
        cashfolioDesktop: {
          name: "Cashfolio desktop",
          styles: { width: "1280px", height: "900px" },
        },
        cashfolioMobile: {
          name: "Cashfolio mobile",
          styles: { width: "390px", height: "844px" },
        },
        cashfolioTablet: {
          name: "Cashfolio tablet",
          styles: { width: "768px", height: "1024px" },
        },
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: {
      story: { autoplay: false },
      // Docs theme does not adapt to system theme out of the box.
      theme: themes.light,
    },
  },
  loaders: [
    async (context) => {
      const { router: routerParameters } =
        context.parameters as RouterStoryParameters;
      const router = createStoryRouter(
        StoryFromContext,
        routerParameters?.initialPath ?? "/",
      );
      // Load the initial route before Storybook renders or starts a play function.
      await router.load();
      return { storyRouter: router };
    },
  ],
  decorators: [
    (Story, context) => (
      <div
        data-ag-theme-mode={
          (context.parameters as RouterStoryParameters).colorScheme ??
          context.globals.colorScheme
        }
      >
        <MantineProvider
          theme={theme}
          forceColorScheme={
            (context.parameters as RouterStoryParameters).colorScheme ??
            context.globals.colorScheme
          }
        >
          {!context.tags.includes("regression") &&
            (context.parameters as RouterStoryParameters).manualSetup && (
              <Text size="sm" c="dimmed" p="sm" role="note">
                {(context.parameters as RouterStoryParameters).manualSetup}
              </Text>
            )}
          <UserLocaleProvider
            locale={normalizeUserLocaleInput(context.globals.locale)}
          >
            <GlobalLoadingProvider>
              <StoryContext.Provider value={Story}>
                <RouterProvider router={context.loaded.storyRouter} />
              </StoryContext.Provider>
            </GlobalLoadingProvider>
          </UserLocaleProvider>
        </MantineProvider>
      </div>
    ),
  ],
};

function createStoryRouter(Story: ComponentType, initialPath: string) {
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
          search={{ tab: "BALANCE", mode: "active" }}
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
  const accountBookSecuritiesRoute = createRoute({
    getParentRoute: () => accountBookRoute,
    path: "/securities",
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
  const accountBookCategoriesRoute = createRoute({
    getParentRoute: () => accountBookRoute,
    path: "/settings/categories",
    component: () => <Story />,
  });
  const accountBookClassificationsRoute = createRoute({
    getParentRoute: () => accountBookRoute,
    path: "/settings/classifications",
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

  const newAccountBookRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/account-books/new",
    component: () => <Story />,
  });
  const userDeleteRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/user/delete",
    component: () => <Story />,
  });

  const accountBookRouteTree = accountBookRoute.addChildren([
    accountBookIndexRoute,
    accountBookAccountsRoute,
    accountBookTransactionsRoute,
    accountBookReportRoute,
    accountBookHistoryRoute,
    accountBookSecuritiesRoute,
    accountBookPeriodRoute,
    accountBookTimelineRoute,
    accountBookSettingsRoute,
    accountBookCategoriesRoute,
    accountBookClassificationsRoute,
    accountBookUserSettingsRoute,
    accountBookValuationCacheRoute,
    accountLedgerRouteTree,
  ]);

  return createRouter({
    routeTree: rootRoute.addChildren([
      rootStoryRoute,
      adminRouteTree,
      userSettingsRoute,
      newAccountBookRoute,
      userDeleteRoute,
      accountBookRouteTree,
    ]),
    history: createMemoryHistory({
      initialEntries: [initialPath],
    }),
  });
}

ensureGridModulesRegistered();

export default preview;

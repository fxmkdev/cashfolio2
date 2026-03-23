import type { Preview } from "@storybook/react-vite";
import { themes } from "storybook/theming";
import {
  AllEnterpriseModule as GridAllEnterpriseModule,
  ModuleRegistry as GridModuleRegistry,
} from "ag-grid-enterprise";
import { MantineProvider } from "@mantine/core";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import "../src/mantine";
import { theme } from "../src/theme";

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
    (Story) => {
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
        component: () => <Story />,
      });

      const accountBookAccountsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/$accountBookId/accounts",
        component: () => <Story />,
      });

      const accountLedgerRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/$accountBookId/$accountId",
        component: () => <Story />,
      });

      const router = createRouter({
        routeTree: rootRoute.addChildren([
          rootStoryRoute,
          accountBookRoute,
          accountBookAccountsRoute,
          accountLedgerRoute,
        ]),
        // Storybook renders stories inside /iframe.html, so links/routes must
        // resolve relative to that base path.
        basepath: "/iframe.html",
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

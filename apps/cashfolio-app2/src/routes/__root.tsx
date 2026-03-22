import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import {
  ColorSchemeScript,
  MantineProvider,
  mantineHtmlProps,
  useComputedColorScheme,
} from "@mantine/core";
import "../mantine";
import { theme } from "../theme";
import {
  AllCommunityModule as ChartsAllCommunityModule,
  ModuleRegistry as ChartsModuleRegistry,
} from "ag-charts-community";
import {
  AllEnterpriseModule as GridAllEnterpriseModule,
  ModuleRegistry as GridModuleRegistry,
} from "ag-grid-enterprise";
import { useEffect } from "react";

ChartsModuleRegistry.registerModules([ChartsAllCommunityModule]);
GridModuleRegistry.registerModules([GridAllEnterpriseModule]);

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>cashfolio-app2</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap"
        />
        <ColorSchemeScript defaultColorScheme="auto" />
        <HeadContent />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="auto">
          <AgThemeModeSynchronizer>
            <Outlet />
          </AgThemeModeSynchronizer>
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  );
}

function AgThemeModeSynchronizer({ children }: { children: React.ReactNode }) {
  const colorScheme = useComputedColorScheme();

  useEffect(() => {
    document.documentElement.setAttribute("data-ag-theme-mode", colorScheme);
  }, [colorScheme]);

  return children;
}

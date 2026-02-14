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
  useMantineTheme,
} from "@mantine/core";
import "@mantine/core/styles.css";
import { theme } from "../theme";
import { ModuleRegistry, AllEnterpriseModule } from "ag-grid-enterprise";
import { useColorScheme } from "@mantine/hooks";

ModuleRegistry.registerModules([AllEnterpriseModule]);

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
          <AgGridThemeProvider>
            <Outlet />
          </AgGridThemeProvider>
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  );
}

function AgGridThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  return <div data-ag-theme-mode={colorScheme}>{children}</div>;
}

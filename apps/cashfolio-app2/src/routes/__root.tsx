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
import { Notifications } from "@mantine/notifications";
import { NavigationLoadingBar } from "../components/navigation-loading-bar";
import "../mantine";
import { theme } from "../theme";
import { useEffect } from "react";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Cashfolio</title>
        <link
          rel="icon"
          type="image/png"
          href="/favicon-96x96.png"
          sizes="96x96"
        />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <meta name="apple-mobile-web-app-title" content="Cashfolio" />
        <link rel="manifest" href="/site.webmanifest" />
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
          <Notifications />
          <NavigationLoadingBar />
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

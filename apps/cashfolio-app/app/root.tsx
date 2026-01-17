import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  type LoaderFunctionArgs,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { ensureUser } from "./users/functions.server";
import { getPageTitle } from "./meta";
import { LoadingBar } from "./platform/loading-bar";
import { defaultShouldRevalidate } from "./revalidation";
import {
  AllEnterpriseModule,
  LicenseManager,
  ModuleRegistry,
} from "ag-charts-enterprise";
import { useRef } from "react";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
  {
    rel: "icon",
    type: "image/png",
    href: "/favicon-96x96.png",
    sizes: "96x96",
  },
  {
    rel: "icon",
    type: "image/svg+xml",
    href: "/favicon.svg",
  },
  {
    rel: "shortcut icon",
    href: "/favicon.ico",
  },
  {
    rel: "apple-touch-icon",
    href: "/apple-touch-icon.png",
    sizes: "180x180",
  },
  {
    rel: "manifest",
    href: "/site.webmanifest",
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await ensureUser(request);

  return {
    viewPreferences: user.viewPreferences as Record<string, string>,
    agGridLicenseKey: process.env.AG_CHARTS_LICENSE_KEY!,
  };
}

export const shouldRevalidate = defaultShouldRevalidate;

export const meta: Route.MetaFunction = () => [
  { title: getPageTitle() },
  { name: "apple-mobile-web-app-title", content: "Cashfolio" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { agGridLicenseKey } = useLoaderData<typeof loader>();
  const isInitializedRef = useRef(false);

  if (isInitializedRef.current === false) {
    ModuleRegistry.registerModules([AllEnterpriseModule]);
    LicenseManager.setLicenseKey(agGridLicenseKey);
  }
  isInitializedRef.current = true;

  return (
    <html
      lang="en"
      className="text-neutral-950 antialiased lg:bg-neutral-100 dark:bg-neutral-900 dark:text-white dark:lg:bg-neutral-950"
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script type="text/javascript">
          {`
if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  document.documentElement.setAttribute("data-theme", "dark");
}
`}
        </script>
      </head>
      <body>
        <LoadingBar />
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}

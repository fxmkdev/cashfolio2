# Routing

Scope: This document describes `apps/cashfolio-app2`. Unless noted otherwise,
paths are relative to that app directory.

Related docs:

- [Server functions](server-functions.md)
- [Account list valuation and reference balances](valuation-reference-balances.md)
- [Valuation caching](valuation-caching.md)

## TanStack Router

- File-based routing in `src/routes/`
- `src/routes/__root.tsx` - root layout with AG Grid + AG Charts module
  registration, Mantine providers, and color scheme sync
- Route files use `createFileRoute` with `loader` for server-side data fetching
  and `component` for rendering

### Not Found Pages

The root route provides a standalone Mantine 404 page for unmatched URLs and
missing or inaccessible resources. The router uses `notFoundMode: "root"` so the
page renders outside account-book and Admin shells and requires no loader data.
It preserves the requested URL and links to `/` with **Go to App**, letting the
home route resolve the user's current accessible book or book creation page. The
recovery link performs a full navigation to discard stale client-side book
options.

After hydration, the 404 page checks the current session through
`getAuthenticationStatus` and shows a secondary **Sign Out** button only for a
confirmed signed-in user. The native POST form reuses `/api/logto/sign-out`. The
check reads authentication context without redirecting, querying the database,
or loading profile/book data. Its response is `Cache-Control: no-store`; each
mount checks again. Sign Out stays hidden while checking, for signed-out
visitors, and if the check fails. The 404 content and **Go to App** remain
available throughout, without adding authentication to the root loader.

Server functions signal missing resources with
`throw notFound({ routeId: rootRouteId })` from `@tanstack/react-router`. Do not
throw a raw `Response` for these failures: it cannot be serialized as route
error state during SSR. Missing account-book access links use the same not-found
signal whether the book is absent or inaccessible. Ledger account lookups remain
scoped to both book and account IDs. Unexpected database errors remain server
failures; do not translate them into 404s.

### Build Diagnostics

The app uses server-side rendering (SSR) without React Server Components (RSC).
Dependencies such as Mantine and TanStack Router ship `"use client"` directives
for RSC consumers. These markers have no role in this app's bundles, but
Rolldown warns for each module that contains one.

`vite.config.ts` filters only `MODULE_LEVEL_DIRECTIVE` warnings mentioning
`use client` through `build.rolldownOptions.onLog`; other diagnostics retain
their default handling. Revisit this filter if the app enables RSC.

### Route Structure

- `index.tsx` - authenticated home route; redirects to the first accessible
  account book, or to `/account-books/new` when the user has no account books
- `account-books/new.tsx` - account-book creation route; creates an empty book,
  links it to the current user, and relies on the existing database trigger to
  seed only the system-managed Gain/Loss account. This route is outside the
  account-book shell and shows either a user sign-out menu or a back link to the
  source account book when opened from the account-book switcher.
- `admin/route.tsx` - Admin-only Cashfolio Admin shell route using Mantine
  `AppShell` with a left navbar. It is outside the account-book context, has no
  account-book switcher, and loads the current user profile plus locale for the
  shared user menu. Non-admin users receive a `403 Forbidden` loader response
  and see an explanatory Admin access error page.
- `admin/index.tsx` - Admin overview placeholder page showing `Coming soon`.
- `admin/valuation-cache/route.tsx` - global valuation cache explorer page with
  tabs for Currency, Cryptocurrency, and Security; scans cached Redis TimeSeries
  keys, shows all cached units, and displays cached history charts without live
  provider lookups or account-book context.
- `admin/valuation-provider-usage/route.tsx` - Admin-only provider usage page
  showing persisted Currencylayer, Coinlayer, and Marketstack HTTP attempts. It
  summarizes today, 7-day, and 30-day counts and lists recent calls with outcome
  and request-reason metadata.
- `admin/users.tsx` - Admin users page listing app-owned database users and
  supporting app role management and admin-triggered user deletion. Rows are
  enriched with Logto Management API identity fields when available while DB
  rows remain visible if Logto lookup fails or the Logto user is missing.
  Deletion supports missing Logto users, but rejects while Logto identity lookup
  is unavailable.
- `user-settings.tsx` - isolated user settings page for editing Logto-backed
  name/avatar URL and the app-owned locale preference. It accepts a safe
  `returnTo` search parameter so the page can link back to either the Admin UI
  or the originating account-book UI.
- `user/delete.tsx` - canonical self-service user deletion route at
  `/user/delete`. The UI calls the identity a "Cashfolio account" and previews
  affected books. `account/delete.tsx` preserves existing Logto Account Center
  configuration: GET redirects to the canonical route, preserving validated
  `deleted=1` success state, and POST delegates to the same deletion handler.
  New integrations use `/user/delete`. See
  [terminology](ui-patterns.md#identity-and-financial-account-terminology) and
  [deletion behavior](server-functions.md#auth-and-authorization).
- `api/logto/$action.tsx` - auth endpoints: `GET /api/logto/sign-in`,
  `GET /api/logto/callback`, `GET /api/logto/sign-up`,
  `POST /api/logto/sign-out`
- `$accountBookId/route.tsx` - shared account-book shell route using Mantine
  `AppShell` with left navbar navigation (Accounts, Transactions, Report,
  History), an Admin section for account-book Settings and an `Admin` entry that
  navigates to `/admin` in-app for users with the app `ADMIN` role, navbar
  footer actions (Account Book switcher + User menu), and mobile-only header
  burger toggle
  - Uses the theme `sm` breakpoint as the shared source of truth for both navbar
    collapse and header visibility.
  - Supports a desktop sidebar rail mode that keeps icon navigation visible,
    defaults to the expanded sidebar, and persists the global user preference in
    `localStorage`.
  - Keeps `Accounts` highlighted for `/accounts` and loaded asset/liability
    ledgers. Category/system ledgers and unresolved ledger loads leave the
    sidebar unselected. Nested gain/loss reconciliation remains under Report.
  - Ledger entry links capture their immediate source URL, label, and history
    index in typed router history state. Category/system ledgers show a compact
    return link that preserves source search/fragment state and survives reload
    and Back/Forward. Same-ledger period changes and transaction highlighting
    preserve this state. Direct visits have no inferred return destination.
    Return navigation traverses to the source history index when available,
    otherwise replaces the current entry with the validated same-book URL.
  - Loads account-book switcher options and current user profile claims at shell
    level. The footer keeps account-book actions in the account-book menu and
    sign-out in the user menu. The shared user menu links to isolated
    `/user-settings` with the current URL as `returnTo`.
- `$accountBookId/index.tsx` - index redirect route that forwards to
  `$accountBookId/accounts`
- `$accountBookId/accounts/route.tsx` - accounts page with one balance-account
  hierarchy containing active and archived accounts and groups. There are no
  separate Assets/Liabilities tabs or archived view. Accounts URLs canonicalize
  to `tab=BALANCE&mode=active`, including legacy Asset/Liability and
  archived-mode links, with replacement navigation. Legacy Income/Expense tab
  links redirect to settings category management, preserving their tab, mapping
  archived mode to `showArchived=true`, and replacing the history entry.
  - The loader fetches the unified balance-account hierarchy. The shared
    account-management loader fetches only the selected category subtype for
    settings category tabs.
- `$accountBookId/transactions/route.tsx` - transactions page showing one master
  row per transaction, with AG Grid Master Detail expansion for the underlying
  booking rows. The explicit month/year period filter includes a full
  transaction when any of its bookings intersects the selected period.
- `$accountBookId/settings/route.tsx` - account-book settings layout with local
  General/Categories navigation and an outlet. The primary sidebar is unchanged.
- `$accountBookId/settings/index.tsx` - General settings at the existing
  `/settings` URL: account book name, reference currency, start date, and the
  typed-name danger-zone delete flow.
- `$accountBookId/settings/categories/route.tsx` - Income/Expenses category and
  category-group management, including nested groups, ordering, and optional
  archived items within the grid. Its typed `showArchived` search boolean
  defaults to false and is preserved across Income/Expenses tabs. Legacy
  category `mode` parameters normalize to the new visibility state; a valid
  explicit boolean takes precedence. The document title remains Income & Expense
  Categories. Reuses the account-management controller and grid with category
  presentation. The General form is not mounted on this route. Category ledgers
  retain their existing URLs and remain directly accessible from transactions
  and reports.
- `$accountBookId/report/route.tsx` - period layout route with shared period
  search validation and loader data used by nested report pages
- `$accountBookId/report/index.tsx` - report overview page with contribution,
  allocation, and gains/losses breakdown cards. Group Accounts By sits beside
  the period control and switches Assets, Liabilities, and Gain/Loss together
  between Account Structure (default) and Asset Class. Grouping and independent
  drill paths are stored per book in session storage; category/cash-flow
  breakdowns retain their existing structure.
- `$accountBookId/report/gains-losses/$accountId/route.tsx` - dedicated
  gain/loss reconciliation page for account drill-down (opened from Gains/Losses
  Breakdown leaf rows). Recorded-adjustment transaction links open Transactions
  with the resolved reconciliation period and transaction ID, selecting the full
  transaction even when its bookings span periods. Calculated-event and
  execution-residual links keep their existing account-ledger or virtual-account
  Transactions destinations. Browser Back restores the original explanation.
- `$accountBookId/history/route.tsx` - history page showing monthly/yearly
  metric history as a full-page chart with metric-specific rendering:
  - Flow metrics (`totalReturn`, `savings`, `cashFlow`, `income`, `expenses`,
    `gainsLosses`) render as bar + cumulative line + rolling-average line
    (legend toggles each series on/off)
    - Rolling-average window depends on mode:
      - monthly: trailing 12 periods
      - yearly: trailing 5 periods
    - Rolling-average points are hidden for the current period (latest history
      period).
  - Balance metrics (`assets`, `liabilities`, `netWorth`) render as area charts:
    assets (green), liabilities (red), net worth sign-split (green/red)
  - The scope combobox applies to `cashFlow`, `income`, `expenses`,
    `gainsLosses`, and `netWorth`. The `Total` scope preserves the aggregate
    view; concrete scopes replace the selected metric series with that scope's
    value. Gain/Loss scopes use either Account Structure or Asset Class then
    Account, with explicit account metadata driving navigation. Current
    classification applies to all history periods, and an account scope survives
    reclassification.
  - When an account scope is selected, double-click a period bar or an Net Worth
    balance point to open its ledger with that exact month or year. Gain/Loss
    account scopes open the unified account reconciliation page, including
    recorded adjustments, calculated holdings and residuals. Supported synthetic
    and unattributed accounts retain their own explanations. Totals, asset
    classes, groups, overlays, and the opening-balance point do not open an
    account. A hint appears when a destination is available.
  - Cumulative line rebases to the currently visible range for flow metrics so
    navigator/range-button/zoom interactions update the running baseline.
  - Loader fetches only the currently selected granularity (`mode` search
    param), so refresh/direct navigation loads the requested view immediately
  - Viewport controls:
    - Uses AG Charts `navigator` + `ranges` controls.
    - Uses mixed x-axis strategy in
      `src/routes/$accountBookId/history/-chart-options.ts`:
      - flow metrics use `unit-time` for discrete period buckets
      - balance metrics use continuous `time` positioned at period-end dates
        (with exact domain bounds via `nice: false`)
    - Default ranges are monthly `1Y` and yearly `5Y` (see
      `getDefaultRangeButtonLabel` in
      `src/routes/$accountBookId/history/-range-controls.ts`).
    - AG Charts (current app version: `14.2.0`) does not expose a public API to
      select a specific range-button as active. Setting zoom via
      `initialState`/`setState` updates the visible domain but may not mark the
      corresponding range button active.
    - Therefore `src/routes/$accountBookId/history/-page-view.tsx` applies the
      default by programmatically triggering the matching range button after the
      chart mounts. If AG Charts adds a public active-button API, prefer that
      and remove the DOM-trigger fallback.
  - Period overview + history share a non-valuation Redis base-data cache with
    deployment-scoped namespacing via `PERIOD_BASE_CACHE_ENV`.
- `$accountBookId/$accountId/route.tsx` - ledger layout route (loads ledger data
  and provides shared search params for child routes)
- `$accountBookId/$accountId/index.tsx` - ledger page for a single account
- Route-local helper files live inside the owning route folder and either have a
  `-` prefix or live beneath a `-`-prefixed private folder so TanStack Router
  ignores them. Files inside an ignored folder do not need their own prefix.
  Tests and stories are colocated with their implementation. For example:
  - accounts route modules:
    - `$accountBookId/accounts/-page-loader.ts`
    - `$accountBookId/accounts/-page-controller.ts`
    - `$accountBookId/accounts/-page-data.ts`
    - `$accountBookId/accounts/-page-modal-state.ts`
    - `$accountBookId/accounts/-page-reference-balances.ts`
    - `$accountBookId/accounts/-page-columns.tsx`
  - ledger route modules:
    - `$accountBookId/$accountId/-ledger/page-loader.ts`
    - `$accountBookId/$accountId/-ledger/page-controller.ts`
    - `$accountBookId/$accountId/-ledger/page-account-options.ts`
    - `$accountBookId/$accountId/-ledger/page-edit-flow.ts`
    - `$accountBookId/$accountId/-ledger/page-rebook-flow.ts`
    - `$accountBookId/$accountId/-ledger/page-transaction-utils.ts`
    - `$accountBookId/$accountId/-ledger/page-columns.tsx`
  - statement-import modules:
    - `$accountBookId/$accountId/-statement-import/index.ts` preserves the
      feature's parsing and draft facade exports.
    - `$accountBookId/$accountId/-statement-import/parser/` owns CSV parsing,
      normalization, and validation.
    - `$accountBookId/$accountId/-statement-import/draft/` owns draft creation,
      editing, status, account options, matching, and dirty-state helpers.
    - Page controllers, state, balance and inclusion helpers, and UI components
      live directly in `$accountBookId/$accountId/-statement-import/`.
    - The account route directory keeps only `route.tsx`, `index.tsx`, and
      `import-statement.tsx` as route entry files alongside these private
      folders.
  - period gain/loss reconciliation modules:
    - `$accountBookId/report/gains-losses/$accountId/-page-view.tsx`
    - `$accountBookId/report/gains-losses/$accountId/-page-view-types.ts`
    - `$accountBookId/report/gains-losses/$accountId/-page-view-formatters.ts`
    - `$accountBookId/report/gains-losses/$accountId/-page-view-columns.tsx`
    - `$accountBookId/report/gains-losses/$accountId/-realized-event-explain-drawer.tsx`
    - `$accountBookId/report/gains-losses/$accountId/-reconciliation-stat-cards.tsx`
  - history route modules:
    - `$accountBookId/history/-page-loader.ts`
    - `$accountBookId/history/-page-types.ts`
    - `$accountBookId/history/-page-navigation.ts`
    - `$accountBookId/history/-range-controls.ts`
    - `$accountBookId/history/-chart-data.ts`
    - `$accountBookId/history/-chart-options.ts`
    - `$accountBookId/history/-page-view.tsx`
- Large route-local surfaces may also use `-`-prefixed private folders. The
  report route uses `-breakdown/`, `-gains-losses/`, `-selector/`, and
  `-net-worth/` to keep URL routes separate from page internals.

### Search Parameters

Ledger and Transactions share `-use-explicit-period-filter.ts` beside the
account-book period-filter component. It owns picker state, month/year mode,
explicit selection derivation, URL normalization, stepping, picker callbacks,
and optional clearing, and returns typed `PeriodFilterAction` props. Each route
supplies its parser, clamping policy, bounds, availability, and navigation
callback; navigation preserves other search parameters and clears
`transactionId` when the period changes.

Ledger remains unfiltered by default and offers Clear Filter on eligible
accounts. It clamps explicit URLs to account-book bounds while allowing
account-specific picker/navigation minimums, so empty periods before the first
account booking remain selected. Transactions defaults to the loader's current
month without adding an implicit period to the URL and does not offer clearing.
The routes retain their different clamping algorithms. Only explicitly supplied
out-of-range URL periods are normalized. Report and History keep their existing
controllers.

- Routes use `validateSearch` to define typed, validated search parameters
- `$accountBookId/accounts/route.tsx` uses:
  - Canonical `tab=BALANCE&mode=active` for the unified Accounts hierarchy;
    these parameters do not select separate account-type or archived views.
  - Legacy Income/Expense tab parameters redirect to Settings category
    management with the selected category tab and archived visibility preserved.
- `$accountBookId/$accountId/route.tsx` uses:
  - `transactionId?: string` to auto-scroll and highlight a booking row
  - `period?: string` for explicit month/year period filtering on supported
    account types (asset, liability, and non-opening-balance equity)
    - Valid explicit periods clamp to account-book date bounds, preserving empty
      periods before an asset/liability account's first booking. The picker
      still starts at that first booking: Previous is disabled for earlier
      periods and Next advances to the first selectable period.
- `$accountBookId/transactions/route.tsx` uses:
  - `transactionId?: string` to auto-scroll and highlight all visible booking
    rows for a transaction
  - `period?: string` for explicit month/year period filtering; omitted values
    default to the current month to keep the initial Transactions payload
    bounded
- `$accountBookId/report/route.tsx` and
  `$accountBookId/report/gains-losses/$accountId/route.tsx` both use
  `period?: string` with the same normalized period semantics
- `$accountBookId/history/route.tsx` uses:
  - The single searchable View tree combines metric and scope selection. Each
    metric root selects its total; descendants select that metric and group,
    account, or Gain/Loss hierarchy node together. Tree values are namespaced by
    metric, while URL parameters retain the existing metric and scope format.
    Selecting a root clears its saved scope and preserves other metrics’ scopes.
    The View selector is disabled while router navigation is pending, including
    scope normalization and back/forward navigation, so a late committed
    selection cannot overwrite the next search query. It becomes available again
    when navigation settles.
  - `mode?: "month" | "year"` to select the history granularity (default:
    monthly)
  - `metric?: "totalReturn" | "savings" | "cashFlow" | "income" | "expenses" | "gainsLosses" | "assets" | "liabilities" | "netWorth"`
    to select the history metric (default: `totalReturn`)
  - `cashFlowScope?`, `incomeScope?`, `expenseScope?`, and `netWorthScope?` use
    `total`, `group:<id>`, or `account:<id>` for scoped history metrics.
    `gainLossScope?` uses `total` or Period Gain/Loss hierarchy node IDs:
    `group:<id>` / `account:<id>` for Account Structure and
    `asset-class:EQUITIES`, `asset-class:unclassified`, or
    `gain-loss-account:<accountId>` for Asset Class. The View selector nests
    them under By Account Structure and By Asset Class navigation-only headings;
    headings are never URL scopes. Selecting Gain/Loss itself shows the total.
    Legacy `explicit-account:` and `unit-account:` leaves translate to a
    combined account scope when their complete identity is known. Old
    valuation-type/unit scopes and unknown selections fall back to Total. The
    loader normalizes scope before calculating scoped metrics and choosing
    derived cache keys; the route writes the valid selection back to the URL.
    Obsolete report drill paths are clamped, and G/L expanded-group storage uses
    a new version.

### Global Navigation Progress

- Global top loading bar is rendered in `src/routes/__root.tsx` via
  `NavigationLoadingBar`
- Implementation lives in `src/components/navigation/navigation-loading-bar.tsx`
  and uses `@mantine/nprogress` + `useRouterState`
- The progress bar tracks URL transitions only (loading while
  `state.location.href` differs from the last settled URL), including same-route
  search-param navigations (for example, period preset switching)
- It intentionally does not run for same-URL refetches triggered via
  `router.invalidate()` after mutations

### Loader Pattern

- Use `Promise.all()` to fetch multiple server functions in parallel within
  loaders

### Classification Settings

`/$accountBookId/settings/classifications` loads the Asset Class tree and direct
assignment counts. The Settings navigation includes Classifications. The book
layout supplies current class metadata to account editors, bulk assignment,
Accounts columns, and ledger badges. Router invalidation refreshes these choices
after taxonomy changes. Gain/loss Report drill paths and History scopes retain
stable class IDs when nodes move or are renamed; removed selections fall back to
the root or Total. Asset/liability allocation remains based on account
structure.

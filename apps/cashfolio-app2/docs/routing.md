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

### Route Structure

- `index.tsx` - authenticated home route; redirects to the first accessible
  account book, or to `/account-books/new` when the user has no account books
- `account-books/new.tsx` - account-book creation route; creates an empty book,
  links it to the current user, and relies on the existing database trigger to
  seed only the system-managed Gain/Loss account. This route is outside the
  account-book shell and shows either a user sign-out menu or a back link to the
  source account book when opened from the account-book switcher.
- `admin/route.tsx` - Cashfolio Admin shell route using Mantine `AppShell` with
  a left navbar. It is outside the account-book context, has no account-book
  switcher, and loads the current user profile plus locale for the shared user
  menu.
- `admin/index.tsx` - Admin overview placeholder page showing `Coming soon`.
- `admin/valuation-cache/route.tsx` - global valuation cache explorer page with
  tabs for Currency, Cryptocurrency, and Security; scans cached Redis TimeSeries
  keys, shows all cached units, and displays cached history charts without live
  provider lookups or account-book context.
- `user-settings.tsx` - isolated user settings page for editing Logto-backed
  name/avatar URL and the app-owned locale preference. It accepts a safe
  `returnTo` search parameter so the page can link back to either the Admin UI
  or the originating account-book UI.
- `api/logto/$action.tsx` - auth endpoints: `GET /api/logto/sign-in`,
  `GET /api/logto/callback`, `GET /api/logto/sign-up`,
  `POST /api/logto/sign-out`
- `$accountBookId/route.tsx` - shared account-book shell route using Mantine
  `AppShell` with left navbar navigation (Accounts, Transactions, Report,
  History), an Admin section for account-book Settings and an `Admin` entry that
  navigates to `/admin` in-app, navbar footer actions (Account Book switcher +
  User menu), and mobile-only header burger toggle
  - Uses the theme `sm` breakpoint as the shared source of truth for both navbar
    collapse and header visibility.
  - Supports a desktop sidebar rail mode that keeps icon navigation visible,
    defaults to the expanded sidebar, and persists the global user preference in
    `localStorage`.
  - Keeps `Accounts` highlighted for account routes (`/$accountId`) as well as
    `/accounts`.
  - Loads account-book switcher options and current user profile claims at shell
    level. The footer keeps account-book actions in the account-book menu and
    sign-out in the user menu. The shared user menu links to isolated
    `/user-settings` with the current URL as `returnTo`.
- `$accountBookId/index.tsx` - index redirect route that forwards to
  `$accountBookId/accounts`
- `$accountBookId/accounts/route.tsx` - accounts page with tabs (one per account
  type: Asset, Liability, Income, Expense)
  - Loader data is tab-scoped: only the selected tab is fetched in the route
    loader critical path.
- `$accountBookId/transactions/route.tsx` - transactions page showing individual
  bookings across the account book in reverse-chronological order, with an
  explicit month/year period filter and booking-level Edit/Rebook/Delete actions
- `$accountBookId/settings/route.tsx` - account-book settings page for editing
  account book name, reference currency, and start date, plus a danger-zone
  delete flow that requires typing the current account-book name
- `$accountBookId/report/route.tsx` - period layout route with shared period
  search validation and loader data used by nested report pages
- `$accountBookId/report/index.tsx` - report overview page with contribution,
  allocation, and gains/losses breakdown cards
- `$accountBookId/report/gains-losses/$accountId/route.tsx` - dedicated
  gain/loss reconciliation page for unit-account drill-down (opened from
  Gains/Losses Breakdown leaf rows)
- `$accountBookId/history/route.tsx` - history page showing monthly/yearly
  metric history as a full-page chart with metric-specific rendering:
  - Flow metrics (`totalReturn`, `savings`, `income`, `expenses`, `gainsLosses`)
    render as bar + cumulative line + rolling-average line (legend toggles each
    series on/off)
    - Rolling-average window depends on mode:
      - monthly: trailing 12 periods
      - yearly: trailing 5 periods
    - Rolling-average points are hidden for the current period (latest history
      period).
  - Balance metrics (`assets`, `liabilities`, `netWorth`) render as area charts:
    assets (green), liabilities (red), net worth sign-split (green/red)
  - The scope combobox applies to `income`, `expenses`, `gainsLosses`, `assets`,
    and `liabilities`. The `Total` scope preserves the aggregate view; concrete
    scopes replace the selected metric series with that scope's value. Gain/Loss
    scopes use the Period Gains/Loss hierarchy: unit type, unit, then
    asset/liability account; Explicit G/L drills only to the counterpart
    asset/liability account.
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
    - AG Charts (current app version: `13.2.1`) does not expose a public API to
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
- Route-local helper files live inside the owning route folder and are prefixed
  with `-` so TanStack Router ignores them. For example:
  - accounts route modules:
    - `$accountBookId/accounts/-page-loader.ts`
    - `$accountBookId/accounts/-page-controller.ts`
    - `$accountBookId/accounts/-page-data.ts`
    - `$accountBookId/accounts/-page-modal-state.ts`
    - `$accountBookId/accounts/-page-reference-balances.ts`
    - `$accountBookId/accounts/-page-columns.tsx`
  - ledger route modules:
    - `$accountBookId/$accountId/-page-loader.ts`
    - `$accountBookId/$accountId/-page-controller.ts`
    - `$accountBookId/$accountId/-page-account-options.ts`
    - `$accountBookId/$accountId/-page-edit-flow.ts`
    - `$accountBookId/$accountId/-page-rebook-flow.ts`
    - `$accountBookId/$accountId/-page-transaction-utils.ts`
    - `$accountBookId/$accountId/-page-columns.tsx`
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

- Routes use `validateSearch` to define typed, validated search parameters
- `$accountBookId/accounts/route.tsx` uses:
  - `tab: TabValue` to track the active account type tab
  - `mode: "active" | "archived"` to switch between active and archived account
    trees
- `$accountBookId/$accountId/route.tsx` uses:
  - `transactionId?: string` to auto-scroll and highlight a booking row
  - `period?: string` for explicit month/year period filtering on supported
    account types (asset, liability, and non-opening-balance equity)
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
  - `mode?: "month" | "year"` to select the history granularity (default:
    monthly)
  - `metric?: "totalReturn" | "savings" | "income" | "expenses" | "gainsLosses" | "assets" | "liabilities" | "netWorth"`
    to select the history metric (default: `totalReturn`)
  - `incomeScope?`, `expenseScope?`, `assetScope?`, and `liabilityScope?` use
    `total`, `group:<id>`, or `account:<id>` for scoped history metrics.
    `gainLossScope?` uses `total` or Period Gain/Loss hierarchy node IDs such as
    `unit-type:fx`, `unit:fx:USD`, `unit-account:fx:USD:<accountId>`, and
    `explicit-account:<accountId>`.

### Global Navigation Progress

- Global top loading bar is rendered in `src/routes/__root.tsx` via
  `NavigationLoadingBar`
- Implementation lives in `src/components/navigation-loading-bar.tsx` and uses
  `@mantine/nprogress` + `useRouterState`
- The progress bar tracks URL transitions only (loading while
  `state.location.href` differs from the last settled URL), including same-route
  search-param navigations (for example, period preset switching)
- It intentionally does not run for same-URL refetches triggered via
  `router.invalidate()` after mutations

### Loader Pattern

- Use `Promise.all()` to fetch multiple server functions in parallel within
  loaders

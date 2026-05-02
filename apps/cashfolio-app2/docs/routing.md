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
  account book
- `api/logto/$action.tsx` - auth endpoints: `GET /api/logto/sign-in`,
  `GET /api/logto/callback`, `GET /api/logto/sign-up`,
  `POST /api/logto/sign-out`
- `$accountBookId/index.tsx` - index redirect route that forwards to
  `$accountBookId/accounts`
- `$accountBookId/accounts/route.tsx` - accounts page with tabs (one per account
  type: Asset, Liability, Income, Expense)
  - Loader data is tab-scoped: only the selected tab is fetched in the route
    loader critical path.
  - Account-book switcher options are loaded in parallel at route level and
    memoized on the browser side, so tab/mode search changes do not repeatedly
    refetch the same account-book list.
- `$accountBookId/valuation-cache/route.tsx` - valuation cache explorer page
  with tabs for Currency, Cryptocurrency, and Security; shows deduplicated unit
  rows and cached TimeSeries history charts (no live provider lookups)
- `$accountBookId/settings/route.tsx` - account-book settings page for editing
  account book name, reference currency, and start date
- `$accountBookId/period/route.tsx` - period layout route with shared period
  search validation and loader data used by nested period pages
- `$accountBookId/period/index.tsx` - period overview page with contribution,
  allocation, and gains/losses breakdown cards
- `$accountBookId/period/gains-losses/$accountId/route.tsx` - dedicated
  gain/loss reconciliation page for unit-account drill-down (opened from
  Gains/Losses Breakdown leaf rows)
- `$accountBookId/timeline/route.tsx` - timeline page showing monthly/yearly
  metric history as a full-page chart with metric-specific rendering:
  - Flow metrics (`totalReturn`, `savings`, `income`, `expenses`, `gainsLosses`)
    render as bar + cumulative line (legend toggles each series on/off)
  - Balance metrics (`assets`, `liabilities`, `netWorth`) render as area charts:
    assets (green), liabilities (red), net worth sign-split (green/red)
  - Cumulative line rebases to the currently visible range for flow metrics so
    navigator/range-button/zoom interactions update the running baseline.
  - Loader fetches only the currently selected granularity (`mode` search
    param), so refresh/direct navigation loads the requested view immediately
  - Viewport controls:
    - Uses AG Charts `navigator` + `ranges` controls.
    - Uses mixed x-axis strategy in
      `src/routes/$accountBookId/timeline/-chart-options.ts`:
      - flow metrics use `unit-time` for discrete period buckets
      - balance metrics use continuous `time` positioned at period-end dates
        (with exact domain bounds via `nice: false`)
    - Default ranges are monthly `1Y` and yearly `5Y` (see
      `getDefaultRangeButtonLabel` in
      `src/routes/$accountBookId/timeline/-range-controls.ts`).
    - AG Charts (current app version: `13.2.1`) does not expose a public API to
      select a specific range-button as active. Setting zoom via
      `initialState`/`setState` updates the visible domain but may not mark the
      corresponding range button active.
    - Therefore `src/routes/$accountBookId/timeline/-page-view.tsx` applies the
      default by programmatically triggering the matching range button after the
      chart mounts. If AG Charts adds a public active-button API, prefer that
      and remove the DOM-trigger fallback.
  - Period overview + timeline share a non-valuation Redis base-data cache with
    deployment-scoped namespacing via `PERIOD_BASE_CACHE_ENV`.
- `$accountBookId/$accountId/route.tsx` - ledger layout route (loads ledger data
  and provides shared search params for child routes)
- `$accountBookId/$accountId/index.tsx` - ledger page for a single account
- `$accountBookId/$accountId/chart/route.tsx` - balance chart view for
  asset/liability ledgers (daily closing native-unit balance)
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
    - `$accountBookId/period/gains-losses/$accountId/-page-view.tsx`
    - `$accountBookId/period/gains-losses/$accountId/-page-view-types.ts`
    - `$accountBookId/period/gains-losses/$accountId/-page-view-formatters.ts`
    - `$accountBookId/period/gains-losses/$accountId/-page-view-columns.tsx`
    - `$accountBookId/period/gains-losses/$accountId/-realized-event-explain-drawer.tsx`
    - `$accountBookId/period/gains-losses/$accountId/-reconciliation-stat-cards.tsx`
  - timeline route modules:
    - `$accountBookId/timeline/-page-loader.ts`
    - `$accountBookId/timeline/-page-types.ts`
    - `$accountBookId/timeline/-page-navigation.ts`
    - `$accountBookId/timeline/-range-controls.ts`
    - `$accountBookId/timeline/-chart-data.ts`
    - `$accountBookId/timeline/-chart-options.ts`
    - `$accountBookId/timeline/-page-view.tsx`

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
- `$accountBookId/$accountId/chart/route.tsx` intentionally has no search
  params; the ledger/chart switch does not carry `transactionId` or `period`
- `$accountBookId/period/route.tsx` and
  `$accountBookId/period/gains-losses/$accountId/route.tsx` both use
  `period?: string` with the same normalized period semantics
- `$accountBookId/timeline/route.tsx` uses:
  - `mode?: "month" | "year"` to select the timeline granularity (default:
    monthly)
  - `metric?: "totalReturn" | "savings" | "income" | "expenses" | "gainsLosses" | "assets" | "liabilities" | "netWorth"`
    to select the timeline metric (default: `totalReturn`)

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

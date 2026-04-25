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
- `$accountBookId/valuation-cache/route.tsx` - valuation cache explorer page
  with tabs for Currency, Cryptocurrency, and Security; shows deduplicated unit
  rows and cached TimeSeries history charts (no live provider lookups)
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

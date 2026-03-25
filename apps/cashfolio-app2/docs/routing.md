# Routing & Server Functions

Scope: This document describes `apps/cashfolio-app2`. Unless noted otherwise,
paths are relative to that app directory.

## TanStack Router

- File-based routing in `src/routes/`
- `src/routes/__root.tsx` — root layout with AG Grid + AG Charts module
  registration, Mantine providers, and color scheme sync
- Route files use `createFileRoute` with `loader` for server-side data fetching
  and `component` for rendering

### Route Structure

- `index.tsx` — authenticated home route; redirects to the first accessible
  account book
- `api/logto/$action.tsx` — auth endpoints: `GET /api/logto/sign-in`,
  `GET /api/logto/callback`, `GET /api/logto/sign-up`,
  `POST /api/logto/sign-out`
- `$accountBookId/index.tsx` — dashboard page with a monthly income/expense
  chart and period switch (last 12 months or last 10 years)
- `$accountBookId/accounts.tsx` — accounts page with tabs (one per account type:
  Asset, Liability, Income, Expense, Gain/Loss)
  - Loader data is tab-scoped: only the selected tab is fetched in the route
    loader critical path.
- `$accountBookId/$accountId.tsx` — ledger page for a single account
- Route-local helper files can live next to a route file when orchestration
  grows, but they must be prefixed with `-` so TanStack Router ignores them.
  For example: `$accountBookId/-accounts-page-loader.ts`,
  `$accountBookId/-accounts-page-data.ts`,
  `$accountBookId/-accounts-page-columns.tsx`,
  `$accountBookId/-ledger-page-loader.ts`, and
  `$accountBookId/-ledger-page-columns.tsx`.

### Search Parameters

- Routes use `validateSearch` to define typed, validated search parameters
- `$accountBookId/accounts.tsx` uses:
  - `tab: TabValue` to track the active account type tab
  - `mode: "active" | "archived"` to switch between active and archived account
    trees
- `$accountBookId/$accountId.tsx` uses `transactionId?: string` to auto-scroll
  and highlight a booking row
- `$accountBookId/index.tsx` uses `period: "12m" | "10y"` to switch the
  dashboard overview between the default 12-month view and a 10-year view

### Global Navigation Progress

- Global top loading bar is rendered in `src/routes/__root.tsx` via
  `NavigationLoadingBar`
- Implementation lives in `src/components/navigation-loading-bar.tsx` and uses
  `@mantine/nprogress` + `useRouterState`
- The progress bar tracks URL transitions only (loading while
  `state.location.href` differs from the last settled URL), including same-route
  search-param navigations (for example, dashboard period switching)
- It intentionally does not run for same-URL refetches triggered via
  `router.invalidate()` after mutations

### Loader Pattern

- Use `Promise.all()` to fetch multiple server functions in parallel within
  loaders

## Server Functions

- Located in `src/server/` (e.g. `src/server/accounts.ts`)
- Created with `createServerFn` from `@tanstack/react-start`
- Pattern: `createServerFn({ method })` → `.inputValidator()` → `.handler()`
- Server-only modules may use `.server.ts` suffix where helpful (for example
  auth/session integration files), while domain server-function modules in
  `src/server/` commonly use `.ts`
- Key files: `accounts.ts` (barrel), `accounts-queries.ts`,
  `accounts-mutations.ts`, `dashboard.ts`, `ledger.ts`, `transactions.ts`
  (barrel), `transactions-queries.ts`, `transactions-mutations.ts`

### Auth & Authorization

- Logto integration uses `@logto/node` with `CookieStorage` in
  `src/auth/logto.server.ts`
- User auth guard: `src/auth/functions.server.ts` (`ensureAuthenticated`)
- User upsert/lookup: `src/users/functions.server.ts`
- Account-book authorization guard: `src/account-books/functions.server.ts`
- All account/ledger/transaction server functions enforce account-book access
  before querying/updating data
- Same-origin request guard for mutation handlers lives in
  `src/security/same-origin.server.ts` and is applied to account and transaction
  `POST` server functions to reduce CSRF risk.

### Dependency Security Note

- Root `package.json` pins `h3` via `pnpm.overrides` to address transitive
  security advisories while `@tanstack/start-server-core` still references
  `h3@2.0.1-rc.16`.
- Remove this override once TanStack Start upgrades its transitive `h3`
  dependency to a patched release.

### Account Status Actions

The status-changing server functions used by `$accountBookId/accounts.tsx` are
implemented in `src/server/accounts-mutations.ts` and re-exported via
`src/server/accounts.ts`:

- `archiveAccount`
- `archiveAccountGroup`
- `unarchiveAccount`
- `unarchiveAccountGroup`

The accounts route keeps archive/unarchive eligibility in loader data
(`getAccountTreeData`), but all status rules are enforced again in these server
functions.

### Reorder Pattern

`reorderAccountTreeItems` (implemented in `accounts-mutations.ts`, re-exported
from `accounts.ts`) issues a batch of Prisma updates inside a transaction to
update `sortOrder` values after reordering sibling rows in the reorder modal.

### Account List FX Reference Balance

- The account list route (`$accountBookId/accounts.tsx`) renders `Balance` and
  `Balance (<referenceCurrency>)` columns.
- Initial page load requests account tree data with
  `includeReferenceBalances: false` to avoid blocking first paint on external FX
  lookups.
- The route then lazily hydrates `Balance (<referenceCurrency>)` in the
  background for non-equity tabs.
- Reference-currency conversion and account/group reference-balance assembly are
  implemented in `src/server/accounts-queries.ts` (re-exported via
  `src/server/accounts.ts`), using `src/server/fx.server.ts`.
- Currency FX rates are requested from currencylayer historical API and cached
  in Redis TimeSeries keys (`fx:currencylayer:USD:<TARGET_CURRENCY>`).
- Cryptocurrency USD prices are requested from coinlayer historical API and
  cached in Redis TimeSeries keys (`fx:coinlayer:USD:<CRYPTO_SYMBOL>`).
- Security EOD close prices are requested from marketstack API and cached in
  Redis TimeSeries keys (`fx:marketstack:<SYMBOL>:<TRADE_CURRENCY>`).
- When an exact date is not available, the newest available prior rate is used
  (first from cache, otherwise by historical API backtracking).
- Ref-currency balances are populated for `Unit.CURRENCY`,
  `Unit.CRYPTOCURRENCY`, and `Unit.SECURITY` accounts.
- For `Unit.SECURITY`, account `Balance` is treated as quantity and converted as
  `quantity * securityPriceInTradeCurrency * tradeCurrencyToReferenceRate`.
- Group rows in `Balance (<referenceCurrency>)` show aggregated sums of
  descendant accounts across all units with available ref-currency balances
  (including `Unit.SECURITY`).
- If any descendant account has an unavailable (`null`) reference-currency
  balance, the group row remains blank to avoid displaying a partial aggregate.

Required runtime env vars for this feature:

- `CURRENCYLAYER_API_KEY`
- `COINLAYER_API_KEY`
- `MARKETSTACK_API_KEY`
- `REDIS_URL` — must point to a Redis deployment with RedisTimeSeries module
  support (for example, Redis Stack)

`REDIS_URL` should point to the shared staging Redis (with RedisTimeSeries
support) when preview and staging should share FX cache entries.

Dynamic PR preview deployment (`.github/workflows/build.yml`) sets:

- `CURRENCYLAYER_API_KEY` from `secrets.CURRENCYLAYER_API_KEY`
- `COINLAYER_API_KEY` from `secrets.COINLAYER_API_KEY`
- `MARKETSTACK_API_KEY` from `secrets.MARKETSTACK_API_KEY`
- `REDIS_URL` from `secrets.STAGING_REDIS_URL` (shared staging Redis)

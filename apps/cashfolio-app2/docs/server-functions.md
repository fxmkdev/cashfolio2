# Server Functions

Scope: This document describes `apps/cashfolio-app2`. Unless noted otherwise,
paths are relative to that app directory.

Related docs:

- [Routing](routing.md)
- [Account list valuation and reference balances](valuation-reference-balances.md)

## Server Function Pattern

- Public server-function facades live in `src/server/` (for example,
  `src/server/accounts.ts`) so import paths remain stable.
- Domain implementation modules live under `src/server/<domain>/`, currently
  `accounts/`, `period/`, `transactions/`, and `valuation/`.
- They are created with `createServerFn` from `@tanstack/react-start`
- Canonical pattern: `createServerFn({ method })` -> `.inputValidator()` ->
  `.handler()`
- Server-only modules may use `.server.ts` suffix where helpful (for example,
  auth/session integration files), especially for Prisma/Redis/provider or
  request-context implementation modules.
- POST server functions validate object shape and required identifier fields
  before authorization/database work. Use `src/server/input-validation.ts` for
  dependency-free checks.
- Account-book mutations should use `src/server/mutation-guard.server.ts` to
  enforce same-origin and account-book authorization consistently.

## Core Modules

- Key public facades: `accounts.ts`, `account-books.ts`, `transactions.ts`,
  `period.ts`, `period-timeline.ts`, `period-gain-loss-reconciliation.ts`,
  `period-end-net-worth.ts`, `period-opening-balance-net-worth.ts`,
  `valuation.server.ts`, `valuation-cache.ts`
- Domain modules:
  - account/account-book logic: `src/server/accounts/`
  - period overview, timeline, reconciliation, and cache internals:
    `src/server/period/`
  - transaction and rebooking logic: `src/server/transactions/`
  - valuation providers/cache helpers: `src/server/valuation/`
- Valuation internals live in `src/server/valuation/`: `rate-lookups.ts`,
  `source-rates.ts`, `lookup-context.ts`, `providers.ts`, `cache.ts`,
  `backtracking.ts`, `keys.ts`, `types.ts`, `date-utils.ts`, `constants.ts`

## Period Caches

- Period overview and timeline use a shared Redis-backed **non-valuation**
  base-data cache (`src/server/period/period-base-data-cache.ts`) backed by an
  uncached loader module
  (`src/server/period/period-base-data-loader.server.ts`).
- Cached payload scope: DB-derived period inputs only (metadata, scoped raw
  bookings/transactions, raw balances, transfer-clearing buckets).
- Excluded from cache payload: converted valuation outputs and exchange-rate
  results.
- Timeline additionally uses a Redis-backed derived metrics cache
  (`src/server/period/period-timeline-metrics-cache.ts`) for finalized scalar
  Timeline point metrics. This cache sits above the base-data cache, so warm
  hits skip period snapshot loading, valuation conversion, and gain/loss
  recomputation for that point.
- The base-data cache is intentionally kept even with derived Timeline metrics:
  Period overview still consumes the base-data payload directly, and Timeline
  misses still benefit from cached DB-derived inputs.
- Both period cache families share the same environment namespace helper in
  `src/server/period/period-cache.ts`. `PERIOD_BASE_CACHE_ENV` must be set when
  Redis caching is enabled; Fly deployments populate it from the Fly
  app/deployment environment so preview and staging apps can safely share one
  Redis instance.
- Redis key namespace includes deployment scope and invalidation generation:
  - Entry:
    `period:base:v1:{PERIOD_BASE_CACHE_ENV}:{accountBookId}:{generation}:{periodCacheKey}`
  - Index:
    `period:base:index:v1:{PERIOD_BASE_CACHE_ENV}:{accountBookId}:{generation}`
  - Generation pointer:
    `period:base:generation:v1:{PERIOD_BASE_CACHE_ENV}:{accountBookId}`
- Timeline metrics entry:
  `period:timeline:metrics:v1:{PERIOD_BASE_CACHE_ENV}:{accountBookId}:{generation}:{periodCacheKey}:{scopeKey}`
- For preset periods (`mtd`, `ytd`, `last-month`, `last-year`), `periodCacheKey`
  uses resolved concrete ranges (`granularity:from:to`) to avoid key aliasing
  across day/month boundaries.
- For explicit current periods (`YYYY-MM` for current month, `YYYY` for current
  year), `periodCacheKey` includes a UTC-day suffix
  (`{periodValue}:{YYYY-MM-DD}`) so day rollovers do not reuse stale cache
  entries. Historical explicit periods omit the day suffix and can be reused
  across days.
- TTL: 24 hours. Mutating account/transaction server functions explicitly
  invalidate period cache entries for the affected account book by advancing the
  shared generation. Base-data entries are also deleted through their index;
  Timeline metrics entries are generation-invalidated and then expire naturally.
- Timeline metrics entries are written only when every valuation dependency came
  from identity conversion or the long-lived Redis TimeSeries valuation cache.
  Metrics that needed provider fetches, short-lived fallback entries, or missing
  valuation results are returned but not persisted as derived Timeline metrics.
- `updateAccountBookSettings` (`src/server/accounts/account-book-settings.ts`)
  also invalidates period caches when `referenceCurrency` or `startDate`
  changes.
- When `startDate` changes via `updateAccountBookSettings`, all bookings in
  transactions containing an `OPENING_BALANCES` booking are shifted to the day
  before the new start date, preserving the opening-balance date invariant.

## Auth and Authorization

- Logto integration uses `@logto/node` with `CookieStorage` in
  `src/auth/logto.server.ts`
- User auth guard: `src/auth/functions.server.ts` (`ensureAuthenticated`)
- User upsert/lookup: `src/users/functions.server.ts`
- Account-book authorization guard: `src/account-books/functions.server.ts`
- All account/ledger/transaction server functions enforce account-book access
  before querying/updating data
- Same-origin request guard for mutation handlers lives in
  `src/security/same-origin.server.ts` and is applied to account and transaction
  `POST` server functions to reduce CSRF risk

## Dependency Security Note

- Root `package.json` pins `h3` via `pnpm.overrides` to address transitive
  security advisories while `@tanstack/start-server-core` still references
  `h3@2.0.1-rc.16`
- Remove this override once TanStack Start upgrades its transitive `h3`
  dependency to a patched release

## Account Status Actions

The status-changing server functions used by `$accountBookId/accounts.tsx` are
implemented in `src/server/accounts/accounts-mutations.ts` and re-exported via
`src/server/accounts.ts`:

- `archiveAccount`
- `archiveAccountGroup`
- `unarchiveAccount`
- `unarchiveAccountGroup`

The accounts route keeps archive/unarchive eligibility in loader data
(`getAccountTreeData`), but all status rules are enforced again in these server
functions.

## Reorder Pattern

`reorderAccountTreeItems` (implemented in
`src/server/accounts/accounts-mutations.ts`, re-exported from
`src/server/accounts.ts`) issues a batch of Prisma updates inside a transaction
to update `sortOrder` values after reordering sibling rows in the reorder modal.

## Period Overview Gain/Loss

The canonical period gain/loss semantics are shared between:

- `getPeriodOverview` (`src/server/period.ts`)
- timeline metrics loading
  (`src/server/period/period-timeline-point-metrics.server.ts`)

Both loaders reuse the shared period base-data cache and shared gain/loss
subflows while keeping their output work focused:

- period overview computes the full response payload
- timeline metrics compute only scalar series values

The engine keeps period gains/losses aligned with net-worth deltas by using a
single tracked-account flow:

- Tracked accounts include:
  - non-reference real holding accounts
  - non-reference virtual transfer-clearing holding accounts
- Both real transactions and synthetic transfer-clearing transactions flow
  through the same lot/FIFO pipeline in
  `src/server/period/period-overview-holdings.ts`
- Same-unit mixed-period holding transfers are treated as non-realizing carry
  adjustments, so in-period legs no longer create false realization when the
  opposite leg sits outside the selected period.
- Explicit gain/loss remains separate from holdings realization:
  - `stats.explicitGainLoss` includes explicit equity G/L bookings only
  - `stats.realizedGainLoss` includes holdings realization and residual-only
    execution reconciliation
  - `stats.gainsLosses = explicit + realized + unrealized`

Execution-residual reconciliation for eligible multi-unit income/expense
transactions is isolated in `src/server/period/period-execution-residuals.ts`:

- Candidate transactions are narrowed at query level to completed (no
  post-period legs) multi-unit transactions with at least one in-period booking
  and at least one income/expense leg, while excluding explicit/opening balance
  cases
- Residual realization is skipped unless all required conversions succeed and no
  in-period tracked holding booking exists in the transaction
- Residual breakdown attribution is weighted across non-reference legs by
  absolute converted amount

Transfer-clearing candidate loading now includes income/expense equity legs in
addition to asset/liability legs. This keeps net-worth timing aligned when
cross-period income/expense transactions remain partially posted at period end.

To keep `src/server/period.ts` as a stable facade, the larger gain/loss subflows
are split into dedicated modules under `src/server/period/`:

- `src/server/period/period-equity-bookings.ts` handles paged equity booking
  conversion from preloaded period base data, equity aggregation, and explicit
  counterpart attribution
- `src/server/period/period-holding-gain-loss.ts` handles tracked holding
  lot/FIFO orchestration (real + transfer-clearing synthetic transactions) and
  residual realization integration

## Gain/Loss Reconciliation Explain Fields

`getPeriodGainLossReconciliation` now includes event-level explain data for
`realizedEvents`:

- `lotMatches[]`: consumed-lot attribution for each realised event
  (`acquisitionSortKey/date/source`, matched quantity, lot cost, execution
  price, per-lot delta, running event realised).
- `pricing`: pricing-source metadata (`directConversion`, `residualAdjusted`,
  `marketFallback`) plus market/residual/effective reference amounts.
- `rounding`: raw vs rounded event values used by the reconciliation UI
  explanation drawer.

## Period Warning Surface

When `skippedBookingsCount > 0`, the period page shows a partial-data warning
below the period selector. This warning explicitly states strict
`totalReturn == netWorth delta` checks may be incomplete for the selected period
due to unavailable valuation data.

The period page also shows a net-worth reconciliation warning when
`endOfPeriodNetWorth` does not match `baselineNetWorth + totalReturn` at cent
precision. The baseline uses the previous period's end net worth when available,
and falls back to opening-balance net worth derived from balances strictly
before the current period start.

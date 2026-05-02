# Server Functions

Scope: This document describes `apps/cashfolio-app2`. Unless noted otherwise,
paths are relative to that app directory.

Related docs:

- [Routing](routing.md)
- [Account list valuation and reference balances](valuation-reference-balances.md)

## Server Function Pattern

- Server functions are located in `src/server/` (for example,
  `src/server/accounts.ts`)
- They are created with `createServerFn` from `@tanstack/react-start`
- Canonical pattern: `createServerFn({ method })` -> `.inputValidator()` ->
  `.handler()`
- Server-only modules may use `.server.ts` suffix where helpful (for example,
  auth/session integration files), while domain server-function modules in
  `src/server/` commonly use `.ts`

## Core Modules

- Key files: `accounts.ts` (barrel), `accounts-queries.ts`,
  `accounts-mutations.ts`, `dashboard.ts`, `ledger.ts`, `transactions.ts`
  (barrel), `transactions-queries.ts`, `transactions-mutations.ts`, `period.ts`,
  `period-gain-loss-reconciliation.ts`, `period-unit-format.ts`,
  `valuation.server.ts`, `valuation-cache.ts`
- Valuation internals live in `src/server/valuation/`: `providers.ts`,
  `cache.ts`, `backtracking.ts`, `keys.ts`, `types.ts`, `date-utils.ts`,
  `constants.ts`

## Period Base-Data Cache

- Period overview and timeline use a shared Redis-backed **non-valuation**
  base-data cache (`src/server/period-base-data-cache.ts`) backed by an uncached
  loader module (`src/server/period-base-data-loader.server.ts`).
- Cached payload scope: DB-derived period inputs only (metadata, scoped raw
  bookings/transactions, raw balances, transfer-clearing buckets).
- Excluded from cache payload: converted valuation outputs and exchange-rate
  results.
- Redis key namespace includes deployment scope and invalidation generation:
  - Entry:
    `period:base:v1:{PERIOD_BASE_CACHE_ENV}:{accountBookId}:{generation}:{periodCacheKey}`
  - Index:
    `period:base:index:v1:{PERIOD_BASE_CACHE_ENV}:{accountBookId}:{generation}`
  - Generation pointer:
    `period:base:generation:v1:{PERIOD_BASE_CACHE_ENV}:{accountBookId}`
- For preset periods (`mtd`, `ytd`, `last-month`, `last-year`), `periodCacheKey`
  uses resolved concrete ranges (`granularity:from:to`) to avoid key aliasing
  across day/month boundaries.
- For explicit current periods (`YYYY-MM` for current month, `YYYY` for current
  year), `periodCacheKey` includes a UTC-day suffix
  (`{periodValue}:{YYYY-MM-DD}`) so day rollovers do not reuse stale cache
  entries.
- TTL: 24 hours. Mutating account/transaction server functions explicitly
  invalidate cache entries for the affected account book by advancing the
  generation.
- `PERIOD_BASE_CACHE_ENV` must be set when Redis caching is enabled. On Fly
  deployments this is set from `FLY_APP` to isolate multiple preview/staging
  deployments sharing one Redis instance.

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
implemented in `src/server/accounts-mutations.ts` and re-exported via
`src/server/accounts.ts`:

- `archiveAccount`
- `archiveAccountGroup`
- `unarchiveAccount`
- `unarchiveAccountGroup`

The accounts route keeps archive/unarchive eligibility in loader data
(`getAccountTreeData`), but all status rules are enforced again in these server
functions.

## Reorder Pattern

`reorderAccountTreeItems` (implemented in `accounts-mutations.ts`, re-exported
from `accounts.ts`) issues a batch of Prisma updates inside a transaction to
update `sortOrder` values after reordering sibling rows in the reorder modal.

## Period Overview Gain/Loss

The canonical period gain/loss engine lives in
`src/server/period-overview.server.ts` and is used by both:

- `getPeriodOverview` (`src/server/period.ts`)
- timeline metrics loading (`src/server/period-timeline-point-metrics.server.ts`)

This keeps period overview and timeline total-return semantics aligned while
still reusing the shared period base-data cache.

The engine keeps period gains/losses aligned with net-worth deltas by using a
single tracked-account flow:

- Tracked accounts include:
  - non-reference real holding accounts
  - non-reference virtual transfer-clearing holding accounts
- Both real transactions and synthetic transfer-clearing transactions flow
  through the same lot/FIFO pipeline in `src/server/period-overview-holdings.ts`
- Same-unit mixed-period holding transfers are treated as non-realizing carry
  adjustments, so in-period legs no longer create false realization when the
  opposite leg sits outside the selected period.
- Explicit gain/loss remains separate from holdings realization:
  - `stats.explicitGainLoss` includes explicit equity G/L bookings only
  - `stats.realizedGainLoss` includes holdings realization and residual-only
    execution reconciliation
  - `stats.gainsLosses = explicit + realized + unrealized`

Execution-residual reconciliation for eligible multi-unit income/expense
transactions is isolated in `src/server/period-execution-residuals.ts`:

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

To keep `src/server/period.ts` focused as an orchestration entrypoint, the
larger gain/loss subflows are split into dedicated modules:

- `src/server/period-equity-bookings.ts` handles paged equity booking
  conversion, equity aggregation, and explicit counterpart attribution
- `src/server/period-holding-gain-loss.ts` handles tracked holding lot/FIFO
  orchestration (real + transfer-clearing synthetic transactions) and residual
  realization integration

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

When `skippedBookingsCount > 0`, the period page shows a top-level partial-data
warning. This warning explicitly states strict `totalReturn == netWorth delta`
checks may be incomplete for the selected period due to unavailable valuation
data.

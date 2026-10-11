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
- Canonical pattern: `createServerFn({ method })` -> `.validator()` ->
  `.handler()`
- Server-only modules may use `.server.ts` suffix where helpful (for example,
  auth/session integration files), especially for Prisma/Redis/provider or
  request-context implementation modules.
- Exported request-context helpers in client-importable server-function facades
  must use `createServerOnlyFn`, so import protection can remove their
  server-only dependencies from the client bundle.
- POST server functions parse unknown inputs into complete typed payloads before
  authorization/database work. Account/group and transaction contracts live in
  their domain's `*-input-validation.ts` module; account-book contracts live in
  `src/server/account-book-validation.ts`. Use `src/server/input-validation.ts`
  for reusable primitive readers. Construct the returned payload explicitly so
  unknown properties never reach operations.
- Validate nested objects/arrays, enum values, finite monetary numbers, UTC
  booking dates, and 32-bit integer sort orders. Descriptions may be empty
  strings. Reuse the CSV format reader for nested import configuration.
- Preserve omitted update fields as `undefined`; preserve supported `null`
  values for clearing group/parent IDs, opening balances, and CSV configuration.
  Database-dependent business rules (ownership, sibling names, account types,
  balances, and book start-date constraints) remain in domain operations.
- Account-book mutations should use `src/server/mutation-guard.server.ts` to
  enforce same-origin and account-book authorization consistently.

## Core Modules

- Key public facades: `accounts.ts`, `account-books.ts`, `transactions.ts`,
  `period.ts`, `period-history.ts`, `period-gain-loss-reconciliation.ts`,
  `period-end-net-worth.ts`, `period-opening-balance-net-worth.ts`,
  `valuation.server.ts`, `valuation-cache.ts`
- Domain modules:
  - account/account-book logic: `src/server/accounts/`
  - period overview, history, reconciliation, and cache internals:
    `src/server/period/`
  - transaction and rebooking logic: `src/server/transactions/`
  - valuation providers/cache helpers: `src/server/valuation/`
- Valuation internals live in `src/server/valuation/`: `rate-lookups.ts`,
  `source-rates.ts`, `lookup-context.ts`, `providers.ts`, `cache.ts`,
  `backtracking.ts`, `keys.ts`, `types.ts`, `date-utils.ts`, `constants.ts`

### Period Module Organization

Period implementation modules are grouped by concern under `src/server/period/`:

- `base-data/`: database-derived period inputs, loaders, queries, and types
- `cache/`: shared cache generation/key helpers, base-data cache, and History
  metrics cache
- `holdings/`: lot/FIFO gain/loss calculation, holding transfers, and execution
  residuals
- `history/`: History loading, point metrics, scopes, and opening-balance points
- `reconciliation/`: gain/loss reconciliation and event-level explain data
- `breakdown/`: gain/loss breakdowns and contribution attribution
- `overview/`: Period overview loading, aggregation, responses, equity bookings,
  and cash flow
- `transfer-clearing/`: virtual transfer-clearing buckets, hierarchy, and
  gain/loss
- `net-worth/`: end-of-period and opening-balance net-worth loading

Cross-concern selection, conversion, balance statistics, unit formatting, and
period helpers remain at the period folder root. Tests live alongside the
modules they exercise; cross-concern pipeline tests remain at the root. Use
explicit imports between these modules. Existing public facades in `src/server/`
remain the entry points for routes and keep their import paths stable.

## Period Caches

- Period overview and history use a shared Redis-backed **non-valuation**
  base-data cache (`src/server/period/cache/period-base-data-cache.ts`) backed
  by an uncached loader module
  (`src/server/period/base-data/period-base-data-loader.server.ts`).
- Cached payload scope: DB-derived period inputs only (metadata, scoped raw
  bookings/transactions, raw balances, transfer-clearing buckets).
- Excluded from cache payload: converted valuation outputs and exchange-rate
  results.
- History additionally uses a Redis-backed derived metrics cache
  (`src/server/period/cache/period-history-metrics-cache.ts`) for finalized
  scalar History point metrics. This cache sits above the base-data cache, so
  warm hits skip period snapshot loading, valuation conversion, and gain/loss
  recomputation for that point.
- The base-data cache is intentionally kept even with derived History metrics:
  Period overview still consumes the base-data payload directly, and History
  misses still benefit from cached DB-derived inputs.
- Both period cache families share the same environment namespace helper in
  `src/server/period/cache/period-cache.ts`. `PERIOD_BASE_CACHE_ENV` must be set
  when Redis caching is enabled; Fly deployments populate it from the Fly
  app/deployment environment so preview and staging apps can safely share one
  Redis instance.
- Redis key namespace includes deployment scope and the database-backed
  invalidation generation (`AccountBook.periodCacheRevision`):
  - Entry:
    `period:base:v7:{PERIOD_BASE_CACHE_ENV}:{accountBookId}:{generation}:{periodCacheKey}`
  - Index:
    `period:base:index:v7:{PERIOD_BASE_CACHE_ENV}:{accountBookId}:{generation}`
  - Cleanup hint (never used to determine cache validity):
    `period:base:generation:v1:{PERIOD_BASE_CACHE_ENV}:{accountBookId}`
- History metrics entry:
  `period:history:metrics:v6:{PERIOD_BASE_CACHE_ENV}:{accountBookId}:{generation}:{periodCacheKey}:{scopeKey}`
- Base-data v7 and History metrics v6 store monetary values as tagged exact
  decimal strings through `src/server/money-cache-codec.ts`
  (`{ __cashfolioDecimal: "..." }`). Dates retain their existing
  `{ __cashfolioDateMs: milliseconds }` representation. Reads reconstruct
  `MoneyDecimal` values; invalid decimal/date payloads are cache misses. Older
  snapshots are not reused; their entries and indexes expire after 24 hours.
  Account-book deletion cleans up both old and current cache versions.
- For preset periods (`mtd`, `ytd`, `last-month`, `last-year`), `periodCacheKey`
  uses resolved concrete ranges (`granularity:from:to`) to avoid key aliasing
  across day/month boundaries.
- For explicit current periods (`YYYY-MM` for current month, `YYYY` for current
  year), `periodCacheKey` includes a UTC-day suffix
  (`{periodValue}:{YYYY-MM-DD}`) so day rollovers do not reuse stale cache
  entries. Historical explicit periods omit the day suffix and can be reused
  across days.
- TTL: 24 hours. PostgreSQL statement triggers advance the affected account
  books' UUID revisions on Account, AccountGroup, Transaction, and Booking
  inserts/updates/deletes. A settings trigger also advances the revision when
  reference currency or start date changes. The revision commits or rolls back
  with the write, including writes from seed scripts and administrative tools.
- Every cache lookup reads the committed revision from PostgreSQL, including
  warm hits. If that read fails, both Redis reads and writes are bypassed.
  Inflight loads are scoped by revision, so a request after a commit cannot join
  a pre-commit load. Every application process uses the same authoritative
  database revision when choosing cache keys.
- Mutation handlers retain best-effort Redis cleanup through the previous
  base-data index. The cleanup hint is updated before deletion. Redis outages,
  failed cleanup, and process crashes after commit cannot make old cache keys
  valid again; obsolete entries expire naturally. Derived History entries also
  expire naturally.
- Account/transaction mutation handlers retry only rolled-back database
  conflicts, up to three attempts with 100 ms and 200 ms waits. Settings updates
  and book/user deletion use the same helper. Authorization runs before
  retrying; Redis cleanup, Logto calls, and session changes are outside the
  retry loop. This handles book/child deadlocks introduced by the revision
  triggers without replaying committed writes or external effects.
- History metrics entries are written only when every valuation dependency came
  from identity conversion or the long-lived Redis TimeSeries valuation cache.
  Metrics that needed provider fetches, short-lived fallback entries, or missing
  valuation results are returned but not persisted as derived History metrics.
- `updateAccountBookSettings` (`src/server/accounts/account-book-settings.ts`)
  also invalidates period caches when `referenceCurrency` or `startDate`
  changes.
- When `startDate` changes via `updateAccountBookSettings`, all bookings in
  transactions containing an `OPENING_BALANCES` booking are shifted to the day
  before the new start date, preserving the opening-balance date invariant.

## Auth and Authorization

- Logto integration uses `@logto/node` with `CookieStorage` in
  `src/auth/logto.server.ts`
- Logto Account API profile reads and updates are exposed through
  `src/server/user-profile.ts`; profile mutations enforce same-origin request
  checks before calling `PATCH /api/my-account`. User locale settings are stored
  on the app-owned `User` row.
- Self-service deletion is exposed at `/account/delete` for Logto Account
  Center. The `POST` flow uses `src/server/account-deletion.ts` to delete the
  app-owned `User`, remove account books that would otherwise become
  inaccessible, clear book-scoped Redis period caches, and call Logto Management
  API `DELETE /api/users/{userId}` through
  `src/auth/logto-management.server.ts`. It requires
  `LOGTO_MANAGEMENT_API_ENDPOINT`, `LOGTO_MANAGEMENT_API_RESOURCE`,
  `LOGTO_MANAGEMENT_API_APP_ID`, and `LOGTO_MANAGEMENT_API_APP_SECRET`. The same
  Management API helper also reads `GET /api/users/{userId}` and uses batched
  `GET /api/users` exact-id searches for Admin user-table identity enrichment.
- User auth guard: `src/auth/functions.server.ts` (`ensureAuthenticated`)
- User upsert/lookup: `src/users/functions.server.ts`
- Admin user listing, current-user Admin capability checks, role management, and
  admin-triggered deletion of DB-backed users, including missing Logto
  identities: `src/server/admin-users.ts`
- Account-book authorization guard: `src/account-books/functions.server.ts`
- All account/ledger/transaction server functions enforce account-book access
  before querying/updating data
- Same-origin request guard for mutation handlers lives in
  `src/security/same-origin.server.ts` and is applied to account and transaction
  `POST` server functions to reduce CSRF risk

## Dependency Security Note

- TanStack Start now references the patched `h3@2.0.1-rc.20` release, so the
  previous `h3-v2` override is no longer needed.
- Remaining dependency security overrides live in `pnpm-workspace.yaml`.

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
- history metrics loading
  (`src/server/period/history/period-history-point-metrics.server.ts`)

Both loaders reuse the shared period base-data cache and shared gain/loss
subflows while keeping their output work focused:

- period overview computes the full response payload
- history metrics compute only scalar series values

The engine keeps period gains/losses aligned with net-worth deltas by using a
single tracked-account flow:

- Tracked accounts include:
  - non-reference real holding accounts
  - non-reference virtual transfer-clearing holding accounts
- Both real transactions and synthetic transfer-clearing transactions flow
  through the same lot/FIFO pipeline in
  `src/server/period/holdings/period-overview-holdings.ts`
- Same-unit mixed-period holding transfers are treated as non-realizing carry
  adjustments, so in-period legs no longer create false realization when the
  opposite leg sits outside the selected period.
- Explicit gain/loss remains separate from holdings realization:
  - `stats.explicitGainLoss` includes explicit equity G/L bookings only
  - `stats.realizedGainLoss` includes holdings realization and residual-only
    execution reconciliation
  - `stats.gainsLosses = explicit + realized + unrealized`

Execution-residual reconciliation for eligible multi-unit income/expense
transactions is isolated in
`src/server/period/holdings/period-execution-residuals.ts`:

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

- `src/server/period/overview/period-equity-bookings.ts` handles paged equity
  booking conversion from preloaded period base data, equity aggregation, and
  explicit counterpart attribution
- `src/server/period/holdings/period-holding-gain-loss.ts` handles tracked
  holding lot/FIFO orchestration (real + transfer-clearing synthetic
  transactions) and residual realization integration

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

When `skippedBookingsCount > 0`, the report page shows a partial-data warning
below the period selector. This warning explicitly states strict
`totalReturn == netWorth delta` checks may be incomplete for the selected period
due to unavailable valuation data.

The report page also shows a net-worth reconciliation warning when
`endOfPeriodNetWorth` does not match `baselineNetWorth + totalReturn` at cent
precision. The baseline uses the previous period's end net worth when available,
and falls back to opening-balance net worth derived from balances strictly
before the current period start.

## Monetary calculation boundaries

Server monetary amounts, balances, quantities, FIFO lot costs, composed
valuation rates, residual allocation weights, and reconciliation totals use
`MoneyDecimal` from `src/shared/money.ts`: 40 significant digits with half-even
rounding. Normalize Prisma decimals directly through their decimal string
representation; do not convert them to numbers first. Reject non-finite monetary
inputs and persist calculated booking amounts as decimal strings. No database
schema migration is needed.

Same-unit transactions must sum to exactly zero using Decimal, matching the
transaction editor. The former server tolerance of `0.001` no longer applies;
mixed-unit validation semantics are unchanged. The existing FIFO quantity
threshold (`1e-9`) and opening-balance threshold (`1e-6`) remain unchanged and
are compared using Decimal.

Reports retain their existing rounding stages. Round income, expenses, and
gains/losses to two decimal places with half-even rounding; calculate savings
from rounded income and expenses, and total return from rounded savings and
gains/losses. Breakdown and reconciliation rounding stages are likewise
retained. Decimal division still rounds to the configured 40 significant digits.

Request and browser-facing response amounts remain numbers, with existing field
names, nulls, and missing-valuation behavior. `src/server/money-boundary.ts` and
explicit `toMoneyNumber` calls convert only when constructing public responses,
after calculations and rounding. Numeric request values and provider/Redis
TimeSeries rates have only the precision received at those source boundaries;
the refactor cannot recover digits already lost there. Provider and TimeSeries
storage formats and lookup behavior remain unchanged.

# Server Functions

Scope: This document describes `apps/cashfolio-app2`. Unless noted otherwise,
paths are relative to that app directory.

Related docs:

- [Routing](routing.md)
- [Account list valuation and reference balances](valuation-reference-balances.md)

## Server Function Pattern

Server production modules may depend on shared contracts and logic, but must not
import component or route implementations, including type-only dependencies. The
`cashfolio/no-ui-dependencies` lint rule enforces this direction; see
[shared contract ownership](ui-patterns.md#shared-contract-ownership) for its
scope and test exemptions.

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

### Account Mutation Operations

`src/server/accounts/accounts-mutation-operations.ts` keeps the existing
operation exports stable. Implementations live in
`src/server/accounts/mutations/`:

- `account-edit.ts`: account creation/update, immutable unit identity, and CSV
  configuration persistence
- `group-edit.ts`: group creation/update, cycle checks, and cash-flag
  propagation
- `opening-balances.ts`: system account lookup and opening-balance transaction
  creation, reconciliation, and removal
- `status.ts`: account/group archive and unarchive eligibility and writes
- `delete.ts`: account/group deletion checks and writes
- `reorder.ts`: sibling sort-order writes
- `types.ts`: shared operation inputs and mutation results

Every operation still receives the owning mutation boundary's transaction
client. Keep authorization, book locking, conflict retry, and post-commit cache
invalidation in the existing mutation handlers.

### Valuation Provider Adapters

`src/server/valuation/providers.ts` remains the provider facade. Individual HTTP
adapters live in `providers/currencylayer.ts`, `providers/coinlayer.ts`, and
`providers/marketstack.ts`. `providers/request.ts` owns shared fetch timeout,
request-error logging, and attempt-outcome recording. Adapters own their API
key, URL, response interpretation, usage metadata, and HTTP/provider errors;
Marketstack also owns its provider-specific rate-limit retry.

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
calculation-context preparation remain at the period folder root.
`period-calculation-context.ts` prepares the shared maps and virtual hierarchy
from preloaded base data, as described in the
[reporting data-loading boundary](#reporting-data-loading-boundary).
`period-helpers.ts` retains selection/year helpers and rounding, and re-exports
the extracted helpers:

- `breakdown/period-breakdown-state.ts`: group paths, accumulator types, and
  mutable hierarchy nodes shared by breakdown builders
- `breakdown/period-breakdown-buckets.ts` and `period-allocation-breakdown.ts`:
  bucket summaries and period-end allocation
- `breakdown/period-breakdown-hierarchy.ts` and
  `period-signed-breakdown-hierarchy.ts`: positive and signed hierarchy builders
  with their respective pruning/discrepancy rules
- `holdings/period-holding-events.ts`: event-series gain/loss, date grouping,
  ordering, and convertible account selection

Extracted breakdown builders use the shared money rounding primitive directly;
they do not import back through `period-helpers.ts`. Breakdown and holding-event
helpers remain pure and consume prepared inputs; database reads stay in the
base-data loaders. Tests live alongside the modules they exercise; cross-concern
pipeline tests remain at the root. Use explicit imports between these modules.
Existing public facades in `src/server/` remain the entry points for routes and
keep their import paths stable.

### Holding Gain/Loss Engine

`holdings/period-overview-holdings.ts` keeps the public initialization,
transaction-processing, finalization, and combined calculation exports. It owns
transfer classification and cross-account aggregation, and delegates to:

- `period-holding-execution-pricing.ts`: booking conversions, conversion
  counters and missing-conversion callbacks, counterpart pricing, residual
  allocation, and execution-event creation for non-transfer transactions
- `period-holding-account-finalization.ts`: one account's deterministic
  execution order, FIFO lot matching, realized gains, and period-end open-lot
  valuation
- `period-overview-holdings-types.ts`: shared state, callback payloads, and
  skipped-reason types; existing public type exports remain available through
  the engine entrypoint

Accounts and transactions retain their existing processing order. Decimal
precision, thresholds, missing-rate behavior, and reconciliation explain
callbacks are shared by Period overview, History, and reconciliation.

## Concurrent Account-Book Mutations

Account/group mutations, transaction mutations (including bulk statement
imports), and account-book settings updates/deletion use
`src/server/account-book-mutation.server.ts` after authorization. It starts a
Prisma transaction and locks the owning `AccountBook` row with `FOR UPDATE`
before reading state used by business rules. Before acquiring the lock, it sets
transaction-local PostgreSQL `lock_timeout` to 25 seconds. PostgreSQL cancels a
statement that waits that long for a lock. Prisma retains its 30-second
interactive-transaction timeout; it does not interrupt every running database
query, so it is not an unconditional wall-clock deadline. All validation queries
and writes must use the callback's transaction client, including queries in
helper modules.

PostgreSQL SQLSTATE `55P03` (including Prisma's driver-adapter representation)
is translated only after the transaction has rolled back to: "This account book
is busy. No changes were saved. Please try again." Other errors propagate as
before. A busy-book rejection is safe to retry explicitly and is never retried
automatically. Each account, transaction, settings, and book-deletion mutation
wraps a fresh book-locking transaction in one `withDatabaseConflictRetry` loop.
Only fully rolled-back database conflicts receive main's bounded server-side
retries; authorization and post-commit cleanup remain outside that loop.

The transaction explicitly uses `ReadCommitted`: after waiting for a previous
writer, subsequent reads see that writer's committed changes. This protects
group cycle checks, sibling names, cash-flag inheritance, archive/unarchive
checks, opening-balance updates, and booking start-date validation. Mutations in
different books can proceed independently. Redis invalidation happens after
commit.

This is a cooperative application-write protocol, not a database constraint on
arbitrary SQL. New book-scoped application mutations must use the same boundary;
maintenance scripts must coordinate separately. Concurrent edits are applied in
lock order; this does not introduce optimistic edit-version conflict detection.

## Period Caches

Cache key prefixes, current versions, key builders, and version-independent
cleanup patterns are owned by `src/shared/book-cache-keys.ts`. Keep this module
free of runtime dependencies: both app caches/user deletion and the workspace
CLI consume it. Add new book-scoped cache families there so restore and deletion
cleanup stay aligned; version bumps within existing families need no cleanup
list changes. User deletion cleans only the requested books across environment
namespaces and preserves global valuation caches.

- Period overview and history use a shared Redis-backed **non-valuation**
  base-data cache (`src/server/period/cache/period-base-data-cache.ts`) backed
  by an uncached loader module
  (`src/server/period/base-data/period-base-data-loader.server.ts`).
- Cached payload scope: DB-derived period inputs only (metadata, scoped raw
  bookings/transactions, raw balances, transfer-clearing buckets, and complete
  execution-residual candidate transactions).
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
    `period:base:v8:{PERIOD_BASE_CACHE_ENV}:{accountBookId}:{generation}:{periodCacheKey}`
  - Index:
    `period:base:index:v8:{PERIOD_BASE_CACHE_ENV}:{accountBookId}:{generation}`
  - Cleanup hint (never used to determine cache validity):
    `period:base:generation:v1:{PERIOD_BASE_CACHE_ENV}:{accountBookId}`
- History metrics entry:
  `period:history:metrics:v9:{PERIOD_BASE_CACHE_ENV}:{accountBookId}:{generation}:{periodCacheKey}:{scopeKey}`
- Base-data v8 and History metrics v7 store monetary values as tagged exact
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
  from identity conversion or stable Redis TimeSeries hits covering the
  requested day or the publication-window cutoff. Temporarily backtracked older
  quotes are classified as fallback and do not qualify. Metrics that needed
  provider fetches, short-lived fallback entries, or missing valuation results
  are returned but not persisted as derived History metrics.
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
- Self-service deletion is exposed at `/user/delete` for Logto Account Center.
  Configure new integrations with this canonical URL. The legacy
  `/account/delete` endpoint remains compatible: GET redirects to `/user/delete`
  and preserves validated `deleted=1` success state; POST uses the same deletion
  handler and redirects to `/user/delete?deleted=1` after success. Both POST
  endpoints retain authentication, same-origin checks, and final-Admin
  protection. The `POST` flow uses `src/server/user-deletion.ts` to delete the
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
- Each transaction is decomposed by holding identity into maximum cross-account
  transfer quantities and residual executions, regardless of additional fee or
  other bookings. Transfers carry FIFO cost and acquisition order; residual
  quantities alone participate in execution pricing. At a split booking,
  transfer movement precedes its execution remainder. All calculation paths
  replay in booking-date/ID order. Real-account reconciliation loads sibling
  holdings and their period transactions to reconstruct the same transfer basis
  as summaries.
- Same-unit mixed-period holding transfers are treated as non-realizing carry
  adjustments, so in-period legs no longer create false realization when the
  opposite leg sits outside the selected period. Carry legs replay on their own
  booking dates, before any execution remainder of the same booking, so an
  intervening execution sees the updated FIFO position. Each carry group keeps
  its conversion completeness check and opening unit basis across dated batches.
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
- Residual realization uses the same transfer decomposition and is skipped
  unless all required conversions succeed and no residual in-period tracked
  holding booking exists. Fully transferred holding legs cannot suppress
  unrelated execution residuals or receive their attribution
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

## Bulk Transaction Mutations

`rebookBookings` accepts `{ accountBookId, bookingIds, targetAccountId }` and
returns `{ transactionIds }` with unique affected transaction IDs.
`deleteTransactions` accepts `{ accountBookId, transactionIds }` and returns no
payload. Both validate nonempty identifier arrays and deduplicate them before
account-book mutation authorization.

All batch reads, validation, and writes use the transaction client supplied by
`withAccountBookMutation`, inside the existing conflict retry. This locks the
account-book row before reading business-rule state and serializes mutations
with other writers in the same book. Bulk operations do not open nested
transactions. Every requested item must belong to the account book and still
exist. Any invalid item aborts the whole batch. Rebooking preserves existing
opening-balance, account/unit/sign/date restrictions and validates Gain/Loss
against the final proposed accounts for every affected transaction. Deletion
removes complete transactions with cascading bookings. Period-cache cleanup runs
once after commit; database cache-revision triggers participate in the same
transaction. Single-item APIs remain unchanged.

## Reporting data-loading boundary

Period overview and History calculations consume complete database-derived
inputs from `PeriodBaseData`. The base-data loader owns paginated transaction
queries, opening holdings balances, and explicit gain/loss counterpart account
resolution. Execution-residual candidate transactions include all booking legs,
including legs before the selected period; candidate selection retains the
income/expense, completion-period, and explicit/opening-balance exclusions.
Periods before the account-book start contain no residual candidates.

Holding and execution-residual calculation helpers require preloaded inputs and
have no Prisma dependency or fallback queries. They keep valuation resolution
injected through callbacks. `preparePeriodCalculationContext` builds the common
real/virtual account hierarchy, balance maps, account names, and
transfer-clearing holding accounts without modifying cached data. Overview and
History retain their own response assembly, scheduling, and History
valuation-cacheability tracking.

Base-data v8 adds required `executionResidualTransactions` and does not reuse v7
entries. The existing Decimal/date codec, 24-hour TTL, 2 MiB size limit, and
database revision invalidation apply to these raw inputs. Converted residual
results remain outside the base-data cache. History metrics use a separately
versioned cache; v8 excludes results from before partial-transfer recognition
and retains the stable-valuation policy introduced in v7. No schema migration is
required. This boundary removes live database queries during calculations. Each
uncached period dataset is loaded in one read-only PostgreSQL `RepeatableRead`
transaction with a 30-second timeout. Account-book settings, cache revision,
account metadata, balances, all paginated booking/transaction queries, transfer
clearing, and explicit counterpart resolution use that same transaction client.
Transaction failures propagate rather than falling back to independent reads.
Calculations, valuation/provider requests, and Redis I/O run after the
transaction finishes.

The snapshot loader returns its revision as internal metadata; public responses
and cached payloads are unchanged. A base-cache miss is persisted only when the
snapshot revision matches the lookup revision. Derived History metrics also
recheck the revision after calculation and skip persistence if it changed or
cannot be read. An overlapping mutation can therefore return a coherent older
snapshot without contaminating a newer cache generation.

This guarantee applies to each period overview or History point independently. A
multi-period History response may contain points from different committed
revisions; it does not hold one database transaction across all points or
external valuation requests.

## Admin membership and user deletion

Application role changes and user-deletion reservations use
`src/server/admin-mutation.server.ts`. A global PostgreSQL transaction-scoped
advisory lock serializes these operations across users and app instances. Actor
authorization and the remaining-Admin count are re-read after the lock. The
transaction uses Read Committed isolation, a 25-second lock timeout, and the
existing database-only conflict retry. External API calls never run inside that
transaction or its automatic retry. Administrative SQL maintenance must preserve
the same invariant independently.

An active Admin has the `ADMIN` role and `deletionPending = false`. Role changes
reject pending targets; pending users cannot access Admin or authorize Admin
mutations. Self-demotion and Admin-triggered self-deletion remain prohibited.
Self-service deletion of the final Admin returns a readable `409` response
asking them to appoint another Admin first. Non-Admin deletion does not require
another Admin when the application has no Admin users.

Every deletion first commits `User.deletionPending = true` under the same guard.
The migration defaults existing users to false. Both Admin and Account Center
deletions then remove the Logto identity and remove application data. Only after
the database transaction commits do they perform best-effort book-cache cleanup,
using the IDs of books actually deleted. A failed Logto call or database cleanup
leaves the reservation intact: it is never automatically cleared after an
ambiguous failure. This prevents a user being counted as a remaining Admin after
their identity may already have been removed.

Deletion previews are advisory. Final application cleanup locks the target user
row before reading their current membership links, requires the reservation, and
locks the linked book rows in sorted ID order. It then deletes the user and
their links and deletes only those candidate books with no remaining members.
This also covers books linked after reservation and concurrent deletion of the
last members of a shared book. Row locks prevent membership inserts from racing
these decisions. Unrelated historical orphan books are never scanned or deleted.

Admin user-list responses include `deletionPending`. Pending rows display their
status, disable role editing, and offer **Retry Deletion**. Admins can retry
with the existing confirmation flow (external ID when Logto reports a missing
user). Logto `404` and repeated database deletion are idempotent. Self-service
retries remain available while the identity/session is usable; otherwise another
active Admin finishes deletion from the pending row. No background worker or
automatic privilege restoration is introduced.

## Accumulated Account Gain/Loss

`src/server/account-gain-loss.ts` exposes authorized GET functions for
account-list summaries and individual-account summaries/details. The range
loader in `src/server/accounts/account-gain-loss-range.server.ts` uses
account-book start, the existing opening balance date, UTC as-of dates, shared
holding transaction queries, and valuation conversions. Its metadata, opening
balances, transactions, and group hierarchy share one read-only RepeatableRead
snapshot; valuation requests and FIFO replay run after that transaction
completes. All relevant real accounts participate before active/archived and
Asset/Liability display filtering.

`calculateAccountGainLoss` reuses the shared holding FIFO/pricing engine with
chronological replay and per-account callbacks. Shared transaction decomposition
recognizes partial same-unit transfers alongside fee, cash, and other holding
bookings. Valuation prefetch uses the residual booking quantities and memoizes
conversions by original booking ID plus exact quantity. Incomplete-basis
transfer dependencies come from these matched groups. Transfer source routing
remains attached only to temporary replay pools, not persisted open lots. Its
completeness diagnostics propagate missing basis through transfers, and its
optional detail collection retains exact amounts until the numeric serialization
boundary. Transfer receipts match opposing destination lots at each carried
acquisition cost and attribute realised G/L to the destination. Reconciliation
emits one `transferBasis` event per matching receipt (including zero-gain
matches), with the matched quantity, weighted-average carried price, individual
FIFO match prices, and a null `pricing.marketReferenceAmount`. Unmatched
quantities keep their original costs and acquisition order. Split receipt events
use distinct IDs for transfer-basis and execution portions while retaining the
original booking/transaction links. Market-fallback portions also have distinct
event and acquisition-lot identities. Existing period loaders retain their
period-opening valuation and rounding semantics. Accounts-list accumulated G/L
uses the summary cache described below; valuation caches and request-local rate
deduplication remain shared.

### Accounts-list accumulated G/L summary cache

`src/server/accounts/account-gain-loss-cache.server.ts` caches one book-wide
summary dataset, including leaf diagnostics and account/group view metadata.
Filtering by Asset/Liability and account state and Decimal group/footer
aggregation happen after retrieval. Accounts requests the `all` state; group
metadata includes archived state so the shared display projection can aggregate
virtual Archived groups from account leaves. Summary v4 and basis v3 ignore
older payloads without this metadata. Authorization runs before cache access.
Ledger summaries bypass this final-summary cache but share the historical basis
cache below. Calculation drawers bypass both caches.

- Key:
  `account:gain-loss:v4:{PERIOD_BASE_CACHE_ENV}:{accountBookId}:{revision}:{asOfDate}:{latestFetchableDate}`.
  Dates are UTC `YYYY-MM-DD`; both days are captured before loading. The latest
  fetchable day uses the shared valuation publication-window rules.
- TTL is 24 hours; maximum encoded size is 512 KiB. The shared Decimal codec
  preserves exact values, and reads validate the decoded summary structure.
  Payloads exclude transactions, FIFO detail events, and internal cache
  metadata.
- Every lookup reads the committed PostgreSQL revision, including warm hits.
  Inflight promise deduplication uses the entire key, preventing requests after
  a mutation from joining an older calculation. Only the DB snapshot runs inside
  the existing read-only repeatable-read transaction; valuation runs afterwards.
- Persistence requires identity/stable TimeSeries valuation sources, a snapshot
  revision matching the lookup revision and a final DB revision read, and an
  unchanged publication cutoff. Provider/fallback/missing results still answer
  the request without persistence. Database-only completeness diagnostics retain
  their existing meaning and are invalidated by revision/day changes.
- Missing Redis or failed revision reads bypass caching. Malformed or oversized
  entries and Redis command failures fall back to calculation. Read/write
  warnings are throttled per process; the existing required environment
  namespace behavior applies. Obsolete generations expire naturally, and shared
  key-family helpers include this cache in book/user deletion and restore
  cleanup.

A warm hit skips historical DB inputs, valuation, and FIFO replay. Misses use
historical basis caching before falling back to a complete replay.

### Accumulated G/L historical basis cache

`src/server/accounts/account-gain-loss-basis-cache.server.ts` supplies the
Accounts-list cache and ledger summaries with book-wide realised G/L and open
FIFO lots. The calculation separates chronological execution/transfer replay
from closing valuation. A basis hit needs only lightweight validity reads and
closing-price lookups; it does not load historical transactions or reprice
executions. Calculation drawers still replay independently, using the same
stages and retaining detailed execution explanations. Period Report and History
use the shared matching rules with their own period-opening bases and do not use
this historical basis cache.

- Key:
  `account:gain-loss-basis:v3:{PERIOD_BASE_CACHE_ENV}:{accountBookId}:{revision}:{watermark}`.
  The watermark is the latest booking timestamp strictly before the day after
  the requested UTC as-of day, or `empty`. All book bookings participate
  conservatively. Revision and watermark are read together in a read-only
  RepeatableRead transaction. This allows reuse across days and historical
  periods with identical effective bookings while detecting already-posted
  future bookings becoming effective without a database mutation. Dates before
  book start bypass basis caching.
- Payloads include book/account/group metadata, exact Decimal realised amounts,
  and remaining lots with acquisition order. They exclude raw transactions,
  execution explanations, and closing prices. Closing valuation uses a private
  state copy. TTL is seven days, with a 2 MiB encoded limit and shared
  Decimal/date codec; reads validate the structure and holding metadata.
- Only complete bases can persist. Opening/execution dependencies must use
  identity or stable TimeSeries results; non-identity valuation dates must also
  be no newer than the publication cutoff captured before replay. This prevents
  a recent execution priced using the latest available prior day from becoming
  frozen across daily publication boundaries. Missing basis, partial postings,
  incomplete metadata, provider results, and temporary fallback prices prevent
  persistence. Missing or temporary **closing** prices do not prevent basis
  persistence and are retried on subsequent summary requests.
- Cold replay includes its watermark in the same snapshot as historical inputs.
  Persistence checks matching lookup/snapshot revisions and watermarks, a final
  committed revision read, and an unchanged publication cutoff. Revision or
  watermark changes rebuild the complete basis; incremental replay is not used.
- Inflight requests share work by basis key, requested as-of date, and
  publication cutoff so different closing dates never share a final result.
  Rejected loads are removed for retry. Missing Redis, validity-read failures,
  malformed or oversized entries, and cache-command failures fall back to full
  calculation. Authorization and required environment namespace behavior remain
  unchanged.
- Shared book-cache helpers include this family in book/user deletion and
  restore cleanup. Obsolete revisions expire naturally. No migration is needed.

The outer Accounts summary cache retains its 24-hour TTL, date/publication keys,
and valuation-source rules. Historical basis and final-summary cacheability are
tracked separately, so final summaries still cannot freeze temporary prices.

G/L summary v3, historical basis v2, and History metrics v8 do not reuse earlier
generations computed before partial-transfer recognition. Their valuation-source
policies also continue to exclude temporarily backtracked TimeSeries quotes. Old
entries expire naturally under their existing TTLs and remain covered by
version-independent book/user deletion and restore cleanup. Global price/rate
series and their fallback/cooldown caches are preserved.

### Balance-based Asset and Liability Reporting

Report and History classify each balance account by its exact reference-currency
balance at the reporting date, before rounding or grouping. Positive balances
contribute to Assets; absolute values of negative balances contribute to
Liabilities. Zero balances contribute to neither. Stored `ASSET`/`LIABILITY`
types determine eligibility only; equity accounts are excluded. Virtual
transfer-clearing accounts follow the same rule. Net worth remains Assets minus
Liabilities and is unchanged by this classification.

Allocation charts and tables preserve the original account/group hierarchy on
each side, even when a group's accounts have mixed signs. Unavailable valuations
are omitted; both allocation views report the same overall missing-balance
count. Amounts on the liability side are positive debt magnitudes. Existing
allocation rounding and hidden-small-balance discrepancy indicators remain
applicable.

History applies classification independently at every month/year endpoint and
its opening baseline. Account/group scopes contain only that metric's
contribution; a selected account contributes zero while on the opposite side.
Scope options remain the union across period points. History metrics v9 prevents
reuse of results computed with permanent asset/liability classification;
base-data v8 and valuation caches remain compatible.

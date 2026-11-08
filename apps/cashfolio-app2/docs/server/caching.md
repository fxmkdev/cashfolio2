# Period Caching

Scope: `apps/cashfolio-app2`; source paths are relative to that app.

[Server functions](../server-functions.md) ·
[Architecture and ownership](../architecture.md)

## Period Caches

Cache key prefixes, current versions, and key builders are owned by
`src/shared/accounts/book-cache-keys.ts`. Family constants, version-independent
cleanup patterns, and book-ownership checks belong to the dependency-free
workspace package
[`@cashfolio/book-cache-contracts`](../../../../libs/book-cache-contracts/README.md),
consumed directly by the app and CLI through its compiled public export. Add new
book-scoped cache families to that package so restore and deletion cleanup stay
aligned; version bumps within existing families remain app-local and need no
cleanup list changes. User deletion cleans only the requested books across
environment namespaces and preserves global valuation caches.

- Period overview and history use a shared Redis-backed **non-valuation**
  base-data cache (`src/server/period/cache/period-base-data-cache.server.ts`)
  backed by an uncached loader module
  (`src/server/period/base-data/period-base-data-loader.server.ts`).
- Cached payload scope: DB-derived period inputs only (metadata, scoped raw
  bookings/transactions, raw balances, transfer-clearing buckets, and complete
  execution-residual candidate transactions).
- Excluded from cache payload: converted valuation outputs and exchange-rate
  results.
- History additionally uses a Redis-backed derived metrics cache
  (`src/server/period/cache/period-history-metrics-cache.server.ts`) for
  finalized scalar History point metrics. This cache sits above the base-data
  cache, so warm hits skip period snapshot loading, valuation conversion, and
  gain/loss recomputation for that point.
- The base-data cache is intentionally kept even with derived History metrics:
  Period overview still consumes the base-data payload directly, and History
  misses still benefit from cached DB-derived inputs.
- Both period cache families share the same environment namespace helper in
  `src/server/period/cache/period-cache.server.ts`. `PERIOD_BASE_CACHE_ENV` must
  be set when Redis caching is enabled; Fly deployments populate it from the Fly
  app/deployment environment so preview and staging apps can safely share one
  Redis instance.
- Redis key namespace includes deployment scope and the database-backed
  invalidation generation (`AccountBook.periodCacheRevision`):
  - Entry:
    `period:base:v12:{PERIOD_BASE_CACHE_ENV}:{accountBookId}:{generation}:{periodCacheKey}`
  - Index:
    `period:base:index:v12:{PERIOD_BASE_CACHE_ENV}:{accountBookId}:{generation}`
  - Cleanup hint (never used to determine cache validity):
    `period:base:generation:v1:{PERIOD_BASE_CACHE_ENV}:{accountBookId}`
- History metrics entry:
  `period:history:metrics:v15:{PERIOD_BASE_CACHE_ENV}:{accountBookId}:{generation}:{periodCacheKey}:{scopeKey}`
- Base-data v12 and History metrics v15 store monetary values as tagged exact

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
- `updateAccountBookSettings` (`src/server/accounts/settings/handlers.ts`) also
  invalidates period caches when `referenceCurrency` or `startDate` changes.
- When `startDate` changes via `updateAccountBookSettings`, all bookings in
  transactions containing an `OPENING_BALANCES` booking are shifted to the day
  before the new start date, preserving the opening-balance date invariant.

### Defensive cache reads

Book-scoped period and account gain/loss caches use
`src/server/money-cache-read.ts` for bounded UTF-8 reads, JSON/Decimal/date
decoding, and payload-specific validation. Missing, oversized, malformed, or
structurally invalid entries are cache misses. Object validators require a
type-compatible check for every field, including optional fields, so payload
type changes require corresponding validator updates. Period base snapshots
validate nested collections and match the requested book and period; History
metrics enforce their 512 KiB limit before parsing. The shared failure reporter
warns once per fixed operation per process and preserves resource cancellation
errors. Revision checks, publication windows, watermarks, TTLs, and persistence
eligibility remain domain-owned. Valid current payloads retain their keys and
wire format; no cache generation bump is required.

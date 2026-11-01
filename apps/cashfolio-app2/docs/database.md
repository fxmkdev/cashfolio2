# Database & Prisma

Scope: This document describes `apps/cashfolio-app2`. Unless noted otherwise,
paths are relative to that app directory.

- **Prisma 7** with PostgreSQL, schema at `prisma/schema.prisma`
- Generated client output: `src/.prisma-client/`
- Prisma client singleton in `src/prisma.server.ts` — uses `PrismaPg` adapter
  for connection pooling; stores in `global.__db__` in development to avoid
  connection exhaustion during hot reload
- Runtime bootstrap adds `connect_timeout=20` to `DATABASE_URL` when the query
  param is missing (without overriding an explicit value)
- In production, `src/prisma.server.ts` awaits an initial Prisma `$connect()`
  during module initialization so app startup fails before serving traffic when
  the database is unreachable
- Custom Prisma configuration in `prisma.config.ts` at the app root
- Prisma configuration and the workspace CLI call dotenv's `config()` explicitly
  to load `.env` from the current working directory. Existing process
  environment variables take precedence over values in `.env`.
- `prisma generate` works without `DATABASE_URL`; `prisma.config.ts` allows a
  missing URL for generate, while non-generate Prisma commands require
  `DATABASE_URL` via strict env validation
- Fly deploys run migrations through
  `scripts/prisma-migrate-deploy-with-retry.sh`, which retries likely transient
  `P1001` reachability failures with backoff and fails fast for clearly
  non-transient host/DNS resolution errors
- The database owns system-managed Gain/Loss account seeding for new books via
  the `AccountBook_ensure_gain_loss_account` trigger. Application account-book
  creation should create the `AccountBook` and user link only; the trigger
  creates the one system-managed `Gain/Loss` equity account.
- The database also owns `AccountBook.periodCacheRevision` (UUID). Statement
  triggers on Account, AccountGroup, Transaction, and Booking refresh each
  affected book once per statement; updates that reassign rows refresh both
  books. A row trigger refreshes the revision for reference currency/start date
  edits. Revisions roll back with failed writes and do not change `updatedAt`.
  Report cache readers query the revision before using Redis, so invalidation
  remains correct when Redis cleanup fails. These triggers require ordinary
  UPDATE permission on AccountBook and serialize revision updates per book.
- Revision triggers acquire the book row after child writes, so concurrent
  multi-statement mutations can form a book/child lock cycle. Application
  account/transaction mutations, settings updates, and book/user deletion retry
  rolled-back database conflicts with `withDatabaseConflictRetry`: at most three
  attempts, with 100 ms and 200 ms delays. It recognizes Prisma P2034 and P2010
  carrying PostgreSQL 40P01; other failures and the final conflict propagate.
  Each attempt recreates its transactions and queries. Authorization and
  external effects stay outside retries; the staging seed retains its own
  existing retry workflow.

## Models

**Core accounting models** (all use composite keys — see below):

- `AccountBook` — top-level container with required `startDate`
- `AccountGroup` — hierarchical via self-referencing `parentGroupId`; has
  `type`, `equityAccountSubtype`, `isActive`, `sortOrder`
- `Account` — belongs to a group; has `type`, `equityAccountSubtype`,
  `isActive`, `unit`, `currency`, `cryptocurrency`, `symbol`, `tradeCurrency`,
  `sortOrder`, `assetClass`, `trackingMethod`. Tracking method defaults to
  `INDIVIDUAL_UNITS` for new and existing accounts; `TOTAL_PORTFOLIO_VALUE` is
  permitted only for currency balance accounts, enforced by a database CHECK. It
  is editable reporting metadata and does not change valuation or FIFO.
- `Transaction` — has `description`; contains one or more `Booking` rows
- `Booking` — has `date`, `description`, `value` (Decimal), `unit`, `currency`,
  `cryptocurrency`, `symbol`, `tradeCurrency`, `sortOrder`; links to both
  `Account` and `Transaction`. Booking display order within a transaction uses
  `sortOrder` first, then `id` for deterministic fallback.

**Auth / multi-tenancy models:**

- `User` — identified by `externalId`; has the app-owned `locale`,
  `accountBookLinks`, roles, and timestamps
- `UserAccountBookLink` — composite key `(userId, accountBookId)`; grants a user
  access to an account book
- `AuthSession` — a SHA-256 bearer-token hash, encrypted Logto storage, absolute
  and idle expiry timestamps, and an optional owning user. Anonymous OIDC state
  expires after ten minutes. Authenticated sessions expire after fourteen days
  or twenty-four hours of inactivity. Deleting the user cascades to all
  sessions. The cookie bearer and unencrypted provider credentials are never
  stored in database rows. Expired rows are removed in batches of at most 100
  when a new session is created; indexed expiry checks deny access independently
  of cleanup.
- `AuthSubjectRevocation` — permanent SHA-256 subject hashes and revocation
  timestamps, independent of `User` and its session cascade. Deletion
  reservation writes the marker atomically with `deletionPending`, including for
  Logto-only identities. The migration backfills existing pending deletions.
  Markers survive cleanup and retries; they are not automatically expired or
  removed by user deletion. No raw external ID or provider credentials are
  retained in a marker.

## Enums

- Asset classification uses `ClassificationScheme`, `ClassificationNode`, and
  `AccountClassification`. Composite keys and foreign keys isolate nodes and
  assignments by book and scheme. Each account has at most one node per scheme;
  only balance accounts may have assignments. A missing assignment means
  Unclassified, distinct from Other Assets. The fixed `AssetClass` enum and
  `Account.assetClass` column have been removed. Every book receives the
  protected `assetClass` scheme through a database initialization trigger. New
  books receive nine editable roots and fifteen children, covering cash,
  equities, fixed income, real estate, commodities, digital assets, alternative
  investments, multi-asset investments, and other assets. The defaults have two
  levels with sibling-specific ordering; parent classes remain selectable. Books
  initialized before `20261101120000_hierarchical_default_asset_classes` retain
  their original eight flat roots or their customized taxonomy. The migration
  only replaces the initialization function: it does not add nodes, change
  assignments, or invalidate caches for existing books. Staging resets recreate
  demo books using the same initialization trigger. Default IDs are stable
  uppercase keys; migrated roots retain their old enum keys as IDs, preserving
  active and archived assignments and History links. New custom nodes use CUID2
  IDs. Parent classes can also have direct assignments. Classification has no
  history; current names, hierarchy, and assignments apply to all periods.
  Classification writes participate in period cache revision triggers. Sibling
  names have a case-insensitive unique index; cycle checks run within the
  serialized account-book mutation boundary.

- `AccountType`: `BALANCE`, `EQUITY`. Balance accounts and their groups use
  `BALANCE` regardless of whether their signed balances are owned or owed.
  Income, expense, and gain/loss categories remain `Account` records, and their
  groups remain `AccountGroup` records. Opening Balances is a protected system
  account.
- `EquityAccountSubtype`: `INCOME`, `EXPENSE`, `GAIN_LOSS`, `OPENING_BALANCES`
- `Unit`: `CURRENCY`, `CRYPTOCURRENCY`, `SECURITY`
- `UserRole`: `ADMIN`

The `20261024120000_unify_balance_account_types` migration replaces both legacy
`ASSET` and `LIABILITY` values with `BALANCE` on accounts and groups, including
archived records. It preserves IDs, grouping, metadata, timestamps, and all
bookings, including existing asset classifications. The enum replacement,
recreation of the asset-class eligibility constraint and system-account partial
unique indexes, and rotation of every book's cache revision commit atomically.
Legacy cache payloads are rejected by current validators. Historical migrations
remain unchanged. The existing automatic deployment flow is supported with
accepted temporary read/write errors while old Machines are replaced; see the
[deployment and recovery guidance](deployment.md#balance-account-type-cutover).

## Composite Key Pattern

All main models use `id_accountBookId` composite keys for queries:

```ts
const query = {
  where: { id_accountBookId: { id, accountBookId } },
};
```

This ensures data isolation per account book. Foreign keys also carry
`accountBookId` (e.g. `groupId` + `accountBookId`) to enable this at the
database level.

Monetary server calculations normalize Prisma Decimal values directly into the
shared `MoneyDecimal` (40-digit precision, half-even rounding), and persist
calculated booking values as decimal strings. API amounts remain numeric. See
[Monetary calculation boundaries](server-functions.md#monetary-calculation-boundaries)
for validation, report rounding, and cache representation.

## Pending user deletion

`User.deletionPending` defaults to false. Application deletion reserves the user
before removing their Logto identity. Pending users retain their stored roles
for diagnostics, but are excluded from active-Admin checks and cannot change
roles. A failed cleanup is resumed by retrying deletion, rather than clearing
the flag. See
[Admin membership and user deletion](server-functions.md#admin-membership-and-user-deletion).

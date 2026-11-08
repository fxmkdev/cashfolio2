# Account and Transaction Mutations

Scope: `apps/cashfolio-app2`; source paths are relative to that app.

[Server functions](../server-functions.md) ·
[Architecture and ownership](../architecture.md)

### Account Module Organization

The public `accounts.ts`, `account-books.ts`, and `account-gain-loss.ts` facades
retain their exports. Inside `src/server/accounts/`, `accounts-queries.ts`,
`accounts-mutations.ts`, and `accounts-mutation-operations.server.ts` retain
their existing boundaries. Import internal modules directly from their owners:

- `queries/`: selector metadata, unit usage, tree assembly, ledger actions,
  reference balances, and page composition, each in a focused module. Database
  tree data, valuation helpers, and the page snapshot remain separate owners.
  `types.ts` owns server-private query inputs/state; the read-only
  RepeatableRead page snapshot supplies metadata and tree data to
  `page.server.ts` in one transaction. Query implementations that access Prisma
  or valuation use `.server.ts`; input readers, contracts, and injected pure
  balance calculations keep `.ts`.
- `mutations/`: account/group operations, atomic bulk lifecycle handlers,
  assignments, input validation, cash rules, and system-managed equity guards.
- `hierarchy/`: group paths/ancestry/cycle helpers and group action-availability
  sets shared by reads and writes. Cross-layer eligibility rules live in
  `src/shared/accounts/account-tree-rules.ts` for server/browser reuse.
- `organize/`: versioned snapshots, move validation, availability, and handlers.
- `settings/`: account-book settings and deletion handlers.
- `gain-loss/`: queries, range loading, calculations, recorded adjustments,
  prefetch, and summary/basis caches.

Tests and test support stay beside their implementation. Existing facade tests
exercise the composed handlers; moving an implementation does not add a
forwarding module at its old path.

### Account Mutation Operations

Account mutations accept optional nullable `assetClassId`. Creation stores null
when omitted; updates preserve an omitted value and clear it when explicitly
null. Non-null classification is restricted to assets and liabilities, but is
independent of Unit and cash-flow eligibility. It remains editable independently
of immutable instrument identity. Statement imports preserve classification;
system-created equity accounts remain null.

`setAccountsAssetClass` accepts an account book ID, a nonempty list of account
IDs, and an explicit nullable asset-class node ID. IDs are deduplicated.
Authorization and the serialized account-book mutation boundary apply; every
target must exist in that book and be a balance account before any write. Active
and archived accounts are eligible. The transaction updates only asset class and
invalidates period base-data caches after commit. It returns the target count.
The selection toolbar submits explicit account IDs frozen when the dialog opens.
Group checkboxes select filtered descendant accounts in the grid; group IDs and
newly added group members are excluded from the submitted snapshot. There is no
group-level value or ongoing inheritance.

Asset-class IDs are validated against the account book’s protected scheme inside
the mutation transaction. Reads expose a nullable `assetClassId`; assignments
are stored separately from accounts.

`getAssetClassNodes` returns only book-scoped node metadata for the shared
selectors and labels; it does not load account assignments. The account-book
provider can refresh that metadata independently. Account list, bulk assignment,
and ledger mutation recovery refresh both page constraints and class choices
without remounting open drafts.

`getAssetClasses` returns the book-specific tree and direct active/archived
assignment counts. `saveAssetClass`, `moveAssetClassTreeItems`, and
`deleteAssetClass` use the existing same-origin, authorization, retry, and
serialized book boundaries. Deletion requires an explicit replacement ID or
null; children must be moved or deleted first. Reassignment and deletion commit
atomically. Successful mutations invalidate period caches after commit.
`getAssetClassOrganizeData` returns a coherent, versioned tree with assignment
counts and deletion eligibility. `moveAssetClassTreeItems` accepts selected
class IDs, a nullable parent, First/Last/Before/After placement, and an optional
sibling anchor. Under the book mutation lock it checks the version, book/scheme
membership, cycles, and resulting sibling names before writing parent/order
changes atomically. Complete subtrees move together; assignments remain
unchanged.

Account queries and period base-data snapshots carry classification as metadata.
Changing it uses the existing account mutation boundary, database cache revision
trigger, post-commit cleanup, and router invalidation. Base-data cache v12
includes classification assignments, the class tree, and tracking method.
Classification drives the
[Asset Class → Subclass → Investment Group → Account reporting hierarchy](reporting.md#asset-class-gainloss-reporting)
in Period overview and History; Unit and instrument identity continue to control
valuation and FIFO calculations independently of classification.

`src/server/accounts/accounts-mutation-operations.server.ts` keeps the existing
operation exports stable. Implementations live in
`src/server/accounts/mutations/`:

- `account-edit.server.ts`: account creation/update, immutable unit identity,
  and CSV configuration persistence
- `group-edit.server.ts`: group creation/update, cycle checks, and cash-flag
  propagation
- `opening-balances.server.ts`: system account lookup and opening-balance
  transaction creation, reconciliation, and removal
- `status.server.ts`: account/group archive and unarchive eligibility and writes
- `delete.server.ts`: account/group deletion checks and writes
- `asset-class.server.ts` and `tracking-method.server.ts`: bulk assignment
  operations
- `input.ts`, `cash-rules.server.ts`, and `system-managed-equity-guards.ts`:
  validation and mutation-specific rules
- `types.ts`: shared operation inputs and mutation results

Every operation still receives the owning mutation boundary's transaction
client. Keep authorization, book locking, conflict retry, and post-commit cache
invalidation in the existing mutation handlers.

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

## Account Status Actions

The status-changing server functions used by the shared account-management
feature and `src/routes/$accountBookId/accounts/route.tsx` are implemented in
`src/server/accounts/accounts-mutations.ts` and re-exported via
`src/server/accounts.ts`:

- `archiveAccount`
- `archiveAccountGroup`
- `unarchiveAccount`
- `unarchiveAccountGroup`

The accounts route keeps archive/unarchive eligibility in loader data
(`getAccountTreeData`), but all status rules are enforced again in these server
functions.

## Hierarchy Organization

`getAccountOrganizeData` and `moveAccountTreeItems` accept an optional validated
`scope`: `balance` (default), `income`, or `expense`. Snapshots, versions,
selected items, destinations, and writes stay within that hierarchy. Category
moves cannot cross Income/Expenses or enter system-managed equity groups.
Snapshots include archived descendants and current lifecycle eligibility;
category archive rules allow nonzero balances.

`moveAccountTreeItems` checks the snapshot version and resulting hierarchy under
the serialized book mutation lock, then writes parent/order changes atomically.
Balance-account moves also apply inherited Cash Account settings; category moves
preserve financial fields. Successful structural changes invalidate period
caches. The shared organizer uses canonical move results and read-only recovery
after confirmed editor or lifecycle commits. Reorder-only APIs and dialogs have
been removed.

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

### Unified account management queries

Account-page responses load account/group metadata once inside a read-only
RepeatableRead snapshot. Balance aggregates and booking counts use the same
explicit `AccountReadClient`; selector options, archived constraints, unit
usage, and child-action availability are projected from that shared metadata.
Page assembly runs after the transaction closes. External valuation must remain
outside the database transaction. Standalone query endpoints retain their
existing filters and response contracts.

Tree, page-data, reference-balance, and account gain/loss summary queries accept
the persisted `BALANCE` type directly for both accounts and groups, excluding
categories and system accounts. Balance-group ancestry and G/L aggregation span
all balance accounts. Creation and updates use the same persisted type. Mutation
inputs reject obsolete `ASSET`/`LIABILITY` values; clients loaded before the
cutover must reload. Legacy account-page URLs and browser expansion preferences
remain supported only at their existing presentation boundaries.

Account/group mutations validate parent ownership, balance/category
compatibility, category subtype, active status, and group cycles before saving.
Cash eligibility is based on the explicit flag and currency unit rather than the
balance sign; cash-flow calculation includes marked balance accounts and
excludes pure cash-to-cash transfers. Existing mutation invalidation refreshes
results.

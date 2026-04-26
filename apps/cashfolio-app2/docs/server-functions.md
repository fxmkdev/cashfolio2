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
- `summaryRaw`: raw (unrounded) realised/unrealised/total values for tooltip
  display while keeping `summary` as rounded 2-decimal display values.
- Raw companions for displayed numeric fields are also returned alongside
  rounded values (for example `rawEffectiveReferenceAmount`,
  `rawExecutionUnitPriceInReference`, `rawRealizedGainLossDelta`,
  `rawRunningRealizedGainLoss`, and equivalent raw fields on lot matches and
  unrealised open lots).

## Period Overview Raw Companions

`getPeriodOverview` keeps rounded display-first fields and now also returns raw
companions for exact-value tooltip UX:

- `statsRaw` mirrors `stats` with unrounded values.
- Breakdown totals include raw companions (`totalAmountRaw`) for expense,
  income, asset, and liability sections.
- Breakdown hierarchy nodes include `rawAmount` (alongside rounded `amount`).
- Gains/losses hierarchy nodes include raw companions (`rawRealizedGainLoss`,
  `rawUnrealizedGainLoss`, `rawTotalGainLoss`) alongside rounded values.

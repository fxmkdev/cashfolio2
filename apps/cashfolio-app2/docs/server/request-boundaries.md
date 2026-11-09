# Server Request and Calculation Boundaries

Scope: `apps/cashfolio-app2`; source paths are relative to that app.

[Server functions](../server-functions.md) ·
[Architecture and ownership](../architecture.md)

## Server Function Pattern

Server production modules may depend on shared contracts and logic, but must not
import component or route implementations, including type-only dependencies. The
`cashfolio/no-ui-dependencies` lint rule enforces this direction; see
[shared contract ownership](../ui/layout-and-navigation.md#shared-contract-ownership)
for its scope and test exemptions. Shared modules must not import server
modules, even for types. Account-tree and public gain/loss contracts are owned
by `src/shared/`; existing server type exports remain compatibility re-exports.
Reconciliation calculation inputs and callbacks stay in server modules.

- Public server-function facades live in `src/server/` (for example,
  `src/server/accounts.ts`) so import paths remain stable.
- Domain implementation modules live under `src/server/<domain>/`, currently
  `accounts/`, `period/`, `transactions/`, and `valuation/`.
- They are created with `createServerFn` from `@tanstack/react-start`
- Canonical pattern: `createServerFn({ method })` -> `.validator()` ->
  `.handler()`
- Server-only runtime leaves use `.server.ts`, including Prisma/Redis/provider,
  Node API, and request-context implementations and their server-only consumers.
  Pure helpers and type-only modules keep `.ts`. RPC modules and facades remain
  client-importable; see [module ownership](../module-boundaries.md).
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

### Read request validation

Account, ledger, transaction, and accumulated gain/loss reads parse unknown
request objects before authorization or query execution. Reuse the identifier
readers in `src/server/read-input-validation.ts` and domain-specific readers for
enums and flags; a TypeScript annotation alone is not runtime validation.
Construct response input objects explicitly to discard unknown properties.
Omitted options retain their existing defaults. Ledger flags also accept the
existing `"true"`/`"false"` transport values; optional account hints still fall
back to persisted data when absent, invalid, or stale.

## Native Collection APIs

Server-only code runs on Node 26 and may use `Map.getOrInsertComputed()` to
initialize arrays, sets, or nested maps lazily when grouping values. Keep
read-only fallback lookups non-mutating and preserve existing insertion order
and deduplication behavior.

The app's `ESNext.Collection` TypeScript library provides these declarations; it
does not polyfill the APIs or establish browser support. Client and shared code
must continue to respect the supported browser baseline.

## Core Modules

- Key public facades: `accounts.ts`, `account-books.ts`, `transactions.ts`,
  `period.ts`, `period-history.ts`, `period-gain-loss-reconciliation.ts`,
  `period-end-net-worth.ts`, `period-opening-balance-net-worth.ts`,
  `valuation-cache.ts`. Server-only valuation consumers use
  `valuation.server.ts`.
- Domain modules:
  - account/account-book logic: `src/server/accounts/`
  - period overview, history, reconciliation, and cache internals:
    `src/server/period/`
  - transaction and rebooking logic: `src/server/transactions/`
  - valuation providers/cache helpers: `src/server/valuation/`
- Valuation internals live in `src/server/valuation/`: `rate-lookups.server.ts`,
  `source-rates.server.ts`, `lookup-context.ts`, `providers.server.ts`,
  `cache.server.ts`, `backtracking.server.ts`, `keys.ts`, `types.ts`,
  `date-utils.ts`, `constants.ts`.

### Valuation Provider Adapters

`src/server/valuation/providers.server.ts` remains the provider facade.
Individual HTTP adapters live in `providers/currencylayer.server.ts`,
`providers/coinlayer.server.ts`, and `providers/marketstack.server.ts`.
`providers/request.server.ts` owns shared fetch timeout, request-error logging,
and attempt-outcome recording. Adapters own their API key, URL, response
interpretation, usage metadata, and HTTP/provider errors; Marketstack also owns
its provider-specific rate-limit retry.

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
mixed-unit transactions remain supported when each booking matches its balance
account's unit identity. Create, update, and statement-import mutations validate
account units inside the serialized book transaction, before replacing or
creating bookings. Currencies, cryptocurrencies, and security symbols must
match; security trade currency remains pricing metadata rather than unit
identity. Balance accounts with incomplete unit metadata are rejected. Equity
categories remain unit-independent. Any incompatible booking rejects the entire
mutation, including a complete import batch. Existing data is not rewritten;
edits must meet the same validation. The existing FIFO quantity threshold
(`1e-9`) and opening-balance threshold (`1e-6`) remain unchanged and are
compared using Decimal.

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

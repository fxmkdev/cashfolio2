# Routing & Server Functions

Scope: This document describes `apps/cashfolio-app2`. Unless noted otherwise,
paths are relative to that app directory.

## TanStack Router

- File-based routing in `src/routes/`
- `src/routes/__root.tsx` — root layout with AG Grid module registration,
  Mantine providers, and color scheme sync
- Route files use `createFileRoute` with `loader` for server-side data fetching
  and `component` for rendering

### Route Structure

- `index.tsx` — authenticated home route; redirects to the first accessible
  account book
- `api/logto/$action.tsx` — auth endpoints: `GET /api/logto/sign-in`,
  `GET /api/logto/callback`, `GET /api/logto/sign-up`,
  `POST /api/logto/sign-out`
- `$accountBookId/index.tsx` — accounts page with tabs (one per account type:
  Asset, Liability, Income, Expense, Gain/Loss)
- `$accountBookId/$accountId.tsx` — ledger page for a single account

### Search Parameters

- Routes use `validateSearch` to define typed, validated search parameters
- `$accountBookId/index.tsx` uses:
  - `tab: TabValue` to track the active account type tab
  - `mode: "active" | "archived"` to switch between active and archived account
    trees
- `$accountBookId/$accountId.tsx` uses `transactionId?: string` to auto-scroll
  and highlight a booking row

### Loader Pattern

- Use `Promise.all()` to fetch multiple server functions in parallel within
  loaders

## Server Functions

- Located in `src/server/` (e.g. `src/server/accounts.ts`)
- Created with `createServerFn` from `@tanstack/react-start`
- Pattern: `createServerFn({ method })` → `.inputValidator()` → `.handler()`
- Server-only files use `.server.ts` suffix
- Key files: `accounts.ts`, `ledger.ts`, `transactions.ts`

### Auth & Authorization

- Logto integration uses `@logto/node` with `CookieStorage` in
  `src/auth/logto.server.ts`
- User auth guard: `src/auth/functions.server.ts` (`ensureAuthenticated`)
- User upsert/lookup: `src/users/functions.server.ts`
- Account-book authorization guard: `src/account-books/functions.server.ts`
- All account/ledger/transaction server functions enforce account-book access
  before querying/updating data

### Account Status Actions

`src/server/accounts.ts` contains status-changing server functions used by
`$accountBookId/index.tsx`:

- `archiveAccount`
- `archiveAccountGroup`
- `unarchiveAccount`
- `unarchiveAccountGroup`

The accounts route keeps archive/unarchive eligibility in loader data
(`getAccountTreeData`), but all status rules are enforced again in these server
functions.

### Reorder Pattern

`reorderAccountTreeItems` (in `accounts.ts`) issues a batch of Prisma updates
inside a transaction to update `sortOrder` values after reordering sibling rows
in the reorder modal.

### Account List FX Reference Balance

- The account list route (`$accountBookId/index.tsx`) renders `Balance` and
  `Balance (<referenceCurrency>)` columns.
- Reference-currency conversion is resolved server-side in
  `src/server/accounts.ts`, using `src/server/fx.server.ts`.
- FX rates are requested from currencylayer historical API and cached in Redis
  TimeSeries keys (`fx:currencylayer:USD:<TARGET_CURRENCY>`).
- When an exact date is not available, the newest available prior rate is used
  (first from cache, otherwise by historical API backtracking).
- Ref-currency balances are currently populated for `Unit.CURRENCY` accounts
  only; security and cryptocurrency rows remain empty in that column.

Required runtime env vars for this feature:

- `CURRENCYLAYER_API_KEY`
- `REDIS_URL`

`REDIS_URL` should point to the shared staging Redis when preview and staging
should share FX cache entries.

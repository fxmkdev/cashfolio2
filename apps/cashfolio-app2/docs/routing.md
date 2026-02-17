# Routing & Server Functions

## TanStack Router

- File-based routing in `src/routes/`
- `src/routes/__root.tsx` — root layout with AG Grid module registration,
  Mantine providers, and color scheme sync
- Route files use `createFileRoute` with `loader` for server-side data fetching
  and `component` for rendering

### Route Structure

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

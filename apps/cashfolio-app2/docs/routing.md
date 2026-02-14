# Routing & Server Functions

## TanStack Router

- File-based routing in `src/routes/`
- `src/routes/__root.tsx` — root layout with AG Grid module registration, Mantine providers, and color scheme sync
- Route files use `createFileRoute` with `loader` for server-side data fetching and `component` for rendering

### Route Structure

- `$accountBookId/index.tsx` — accounts page with tabs (one per account type)
- `$accountBookId/$accountId.tsx` — ledger page for a single account

### Search Parameters

- Routes use `validateSearch` to define typed, validated search parameters (e.g. `transactionId` on the ledger route)

### Loader Pattern

- Use `Promise.all()` to fetch multiple server functions in parallel within loaders

## Server Functions

- Located in `src/server/` (e.g. `src/server/accounts.ts`)
- Created with `createServerFn` from `@tanstack/react-start`
- Pattern: `createServerFn({ method })` → `.inputValidator()` → `.handler()`
- Server-only files use `.server.ts` suffix

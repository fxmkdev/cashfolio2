# Routing & Server Functions

## TanStack Router

- File-based routing in `src/routes/`
- `src/routes/__root.tsx` — root layout with Mantine providers
- Route files use `createFileRoute` with `loader` for server-side data fetching and `component` for rendering

## Server Functions

- Located in `src/server/` (e.g. `src/server/accounts.ts`)
- Created with `createServerFn` from `@tanstack/react-start`
- Pattern: `createServerFn({ method })` → `.inputValidator()` → `.handler()`
- Server-only files use `.server.ts` suffix

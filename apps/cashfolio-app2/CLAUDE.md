# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cashfolio is a double-entry accounting web app. This package (`cashfolio-app2`) is a TanStack Start rewrite of the main app (`cashfolio-app`). It uses Vite, React 19, Mantine UI, AG Grid Enterprise, Prisma with PostgreSQL.

Part of a pnpm monorepo at `../../` with workspaces in `apps/` and `tools/`.

## Commands

```bash
pnpm dev          # Start dev server (Vite)
pnpm build        # Production build
pnpm typecheck    # TypeScript check (tsc --noEmit)
pnpm format       # Prettier check
pnpm prisma:generate  # Regenerate Prisma client (DATABASE_URL=dummy prisma generate)
```

No test runner is configured yet for this app. The sibling `cashfolio-app` uses Vitest.

## Architecture

### Routing & Data Loading
- **TanStack Router** with file-based routing in `src/routes/`
- `src/routes/__root.tsx` — root layout with Mantine providers
- `src/routes/$accountBookId.tsx` — main accounts page with tabs, data grid, modals
- Route files use `createFileRoute` with `loader` for server-side data fetching and `component` for rendering
- `src/routeTree.gen.ts` is auto-generated — do not edit

### Server Functions
- `src/server/accounts.ts` — server functions created with `createServerFn` from `@tanstack/react-start`
- Server functions handle all Prisma database calls
- Pattern: `createServerFn({ method })` → `.inputValidator()` → `.handler()`

### Database
- **Prisma 7** with PostgreSQL, schema at `prisma/schema.prisma`
- Generated client output: `src/.prisma-client/`
- Prisma client singleton in `src/prisma.server.ts`
- Key models: AccountBook, AccountGroup (hierarchical), Account, Transaction, Booking
- Enums: `AccountType` (ASSET, LIABILITY, EQUITY), `EquityAccountSubtype` (INCOME, EXPENSE, GAIN_LOSS), `Unit` (CURRENCY, CRYPTOCURRENCY, SECURITY)
- Import enums from `src/.prisma-client/enums` (not from `@prisma/client`)

### UI Patterns
- **Mantine 8** for all UI components, forms (`@mantine/form`), and theming
- **AG Grid Enterprise** wrapped in `src/components/data-grid.tsx` with tree data support
- Modal pattern: `EditAccountModal` / `EditAccountGroupModal` use `isResettingRef` to prevent side effects during form reset, `onExitTransitionEnd` to clear state after close animation
- Type descriptor pattern: account types are represented as `"ASSET" | "LIABILITY" | "EQUITY-INCOME" | "EQUITY-EXPENSE" | "EQUITY-GAIN_LOSS"` strings in form selects, then split into `type` + `equityAccountSubtype` via `transformValues`
- Icons from `@tabler/icons-react`

### Key Conventions
- Server-only files use `.server.ts` suffix
- Prettier for formatting (no ESLint)
- TypeScript strict mode, ESM modules
- Use pnpm as package manager
- Use Mantine styling capabilities where possible; if manual styling is required, use CSS modules

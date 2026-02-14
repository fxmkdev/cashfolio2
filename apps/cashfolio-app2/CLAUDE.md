# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Cashfolio is a double-entry accounting web app built with TanStack Start, Mantine, and Prisma. This package (`cashfolio-app2`) is a rewrite of `cashfolio-app`.

## Commands

```bash
pnpm dev              # Start dev server
pnpm build            # Production build
pnpm typecheck        # tsc --noEmit
pnpm format           # Prettier check
pnpm prisma:generate  # Regenerate Prisma client (DATABASE_URL=dummy prisma generate)
```

## Key Rules

- Use **pnpm** as package manager
- Use **Mantine styling** where possible; use **CSS modules** when manual styling is needed
- Import Prisma enums from `src/.prisma-client/enums` (not `@prisma/client`)
- Do not edit `src/routeTree.gen.ts` (auto-generated)
- When introducing new patterns or conventions, update `CLAUDE.md` and the relevant `docs/` files to keep documentation in sync
- Use **`@tabler/icons-react`** for icons
- Use **`@paralleldrive/cuid2`** for generating unique IDs
- Use **`date-fns`** for date operations
- Use **`react-number-format`** for locale-aware number inputs
- App uses **`en-CH`** locale for number formatting
- Currency/crypto data constants live in `src/currencies.ts` and `src/cryptocurrencies.ts`

## Architecture References

- [Routing & server functions](docs/routing.md)
- [Database & Prisma](docs/database.md)
- [UI patterns](docs/ui-patterns.md)

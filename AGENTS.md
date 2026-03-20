# AGENTS.md

Guidance for coding agents and contributors working in this repository.

This file currently documents only `apps/cashfolio-app2` (the TanStack Start
rewrite of `cashfolio-app`).

Unless explicitly stated otherwise, paths and conventions in this file and the
linked docs are for `apps/cashfolio-app2`.

## Development Commands

```bash
pnpm --filter cashfolio-app2 dev              # Start dev server
pnpm --filter cashfolio-app2 build            # Production build
pnpm --filter cashfolio-app2 typecheck        # tsc --noEmit
pnpm --filter cashfolio-app2 format           # Prettier check
pnpm --filter cashfolio-app2 prisma:generate  # Regenerate Prisma client (DATABASE_URL=dummy prisma generate)
```

## Working Conventions

- Use `pnpm` as package manager.
- Keep changes focused and minimal; avoid unrelated refactors.
- Prefer Mantine styling; use CSS modules when manual styling is required.
- Import Prisma enums from `src/.prisma-client/enums` (not `@prisma/client`).
- Do not edit `src/routeTree.gen.ts` (generated file).
- Keep docs in sync when introducing new patterns or conventions.
- Use `@tabler/icons-react` for icons.
- Use `@paralleldrive/cuid2` for unique IDs.
- Use `date-fns` for date operations.
- Use `react-number-format` for locale-aware number inputs.
- Use `en-CH` locale for number formatting.
- Keep currency/crypto constants in `src/currencies.ts` and
  `src/cryptocurrencies.ts`.

## Quality Checklist

- Run `pnpm --filter cashfolio-app2 typecheck` before finishing code changes.
- Run `pnpm --filter cashfolio-app2 format` when touching formatting-sensitive files.
- If Prisma schema/client changes, run `pnpm --filter cashfolio-app2 prisma:generate`.
- Update relevant docs under `docs/` when behavior or conventions change.

## Architecture References

- [Routing and server functions](docs/routing.md)
- [Database and Prisma](docs/database.md)
- [UI patterns](docs/ui-patterns.md)

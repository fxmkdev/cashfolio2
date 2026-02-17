# AGENTS.md

Guidance for coding agents and contributors working in this repository.

Cashfolio is a double-entry accounting web app built with TanStack Start,
Mantine, and Prisma. This package (`cashfolio-app2`) is a rewrite of
`cashfolio-app`.

## Development Commands

```bash
pnpm dev              # Start dev server
pnpm build            # Production build
pnpm typecheck        # tsc --noEmit
pnpm format           # Prettier check
pnpm prisma:generate  # Regenerate Prisma client (DATABASE_URL=dummy prisma generate)
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

- Run `pnpm typecheck` before finishing code changes.
- Run `pnpm format` when touching formatting-sensitive files.
- If Prisma schema/client changes, run `pnpm prisma:generate`.
- Update relevant docs under `docs/` when behavior or conventions change.

## Architecture References

- [Routing and server functions](docs/routing.md)
- [Database and Prisma](docs/database.md)
- [UI patterns](docs/ui-patterns.md)

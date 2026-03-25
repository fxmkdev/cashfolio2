# AGENTS.md

Guidance for coding agents and contributors working in this repository.

This repository has multiple apps. This file includes:

- repository-wide collaboration rules
- app-specific conventions for `apps/cashfolio-app2` (the TanStack Start rewrite
  of `cashfolio-app`)

Unless explicitly stated otherwise, app-specific paths and conventions in this
file and the linked docs are for `apps/cashfolio-app2`.

## Repository-wide Guidelines

- Use `pnpm` as package manager.
- Keep changes focused and minimal; avoid unrelated refactors.
- Keep docs in sync when introducing new patterns or conventions.
- TanStack Start route filenames often contain `$` (for route params). In shell
  commands, always treat these paths as literals to avoid variable expansion.
  - Prefer wrapping such paths in single quotes, e.g.
    `cat 'apps/cashfolio-app2/src/routes/$accountBookId/$accountId.tsx'`.
  - Or escape the `$` as `\$` when quoting is awkward.
  - For git commands, use `--` before paths, e.g.
    `git add -- 'apps/cashfolio-app2/src/routes/$accountBookId/$accountId.tsx'`.
- Pull request titles must follow Conventional Commits because GitHub squash
  merge is configured to use the PR title as the commit on `main`.
  - Format: `<type>(optional-scope): <description>`
  - Example: `feat(cashfolio-app2): add archived-account unarchive action`
  - Use descriptive commits inside the PR for review clarity; the PR title is
    the canonical squash commit message.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contribution guidelines.

## Docs Structure

- Shared workspace docs: `docs/`
- App-specific architecture docs:
  - `apps/cashfolio-app2/docs/`
  - `apps/cashfolio-app/docs/` (legacy app-local docs)

## Development Commands

```bash
pnpm --filter cashfolio-app2 dev              # Start dev server
pnpm --filter cashfolio-app2 build            # Production build
pnpm --filter cashfolio-app2 typecheck        # tsc --noEmit
pnpm --filter cashfolio-app2 format           # Prettier check
pnpm --filter cashfolio-app2 prisma:generate  # Regenerate Prisma client (DATABASE_URL=dummy prisma generate)
```

## cashfolio-app2 Working Conventions

- Prefer Mantine styling; use CSS modules when manual styling is required.
- Import Prisma enums from `src/.prisma-client/enums` (not `@prisma/client`).
- Do not edit `src/routeTree.gen.ts` (generated file).
- Use `@tabler/icons-react` for icons.
- Use `@paralleldrive/cuid2` for unique IDs.
- Use `date-fns` for date operations.
- Use `react-number-format` for locale-aware number inputs.
- Use `en-CH` locale for number formatting.
- Keep currency/crypto constants in `src/currencies.ts` and
  `src/cryptocurrencies.ts`.
- In `src/routes/`, any non-route file must be prefixed with `-` (for example,
  `src/routes/$accountBookId/-ledger-page-view.tsx`) so TanStack Router skips it
  during route-tree generation.

## Quality Checklist

- Run `pnpm --filter cashfolio-app2 typecheck` before finishing code changes.
- Run `pnpm --filter cashfolio-app2 format` when touching formatting-sensitive
  files.
- Run `pnpm --filter cashfolio-app2 e2e` for changes that bear a significant
  risk of breaking the application.
- If Prisma schema/client changes, run
  `pnpm --filter cashfolio-app2 prisma:generate`.
- Update relevant docs in `docs/` (shared) or app-local `docs/` folders when
  behavior or conventions change.

## Architecture References

- [Routing and server functions](apps/cashfolio-app2/docs/routing.md)
- [Database and Prisma](apps/cashfolio-app2/docs/database.md)
- [UI patterns](apps/cashfolio-app2/docs/ui-patterns.md)

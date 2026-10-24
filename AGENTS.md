# AGENTS.md

Guidance for coding agents and contributors working in this repository.

This repository has multiple apps. This file includes:

- repository-wide collaboration rules
- app-specific conventions for `apps/cashfolio-app2`

Unless explicitly stated otherwise, app-specific paths and conventions in this
file and the linked docs are for `apps/cashfolio-app2`.

## Repository-wide Guidelines

- Use `pnpm` as package manager.
- Use Node 24 for local development, CI, and application runtime.
- Always author new handwritten application code, tests, scripts, and tooling
  (including custom ESLint rules) in TypeScript, and include them in the owning
  package's typecheck. Existing JavaScript files can be migrated separately;
  generated JavaScript and build output are not handwritten source.
- Keep changes focused and minimal; avoid unrelated refactors.
- Keep docs in sync when introducing new patterns or conventions.
- Before starting implementation work, run `git fetch origin` and base new
  branches or worktrees on the freshly fetched `origin/main`.
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
- When the current Codex/chat thread already has an open pull request, push any
  newly applied changes to that PR branch unless explicitly instructed
  otherwise; still fetch first and account for `origin/main` being newer than
  the branch base.
- After you address a pull request review comment, resolve that conversation in
  the PR.
- Keep `@types/node` aligned with the current runtime major (Node 24). Do not
  upgrade to Node 25+ typings until the runtime migration is planned.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contribution guidelines.

## Docs Structure

- Shared workspace docs: `docs/`
- App-specific architecture docs:
  - `apps/cashfolio-app2/docs/`

## Development Commands

```bash
pnpm --filter cashfolio-app2 dev              # Start dev server
pnpm --filter cashfolio-app2 build            # Production build
pnpm --filter cashfolio-app2 typecheck        # tsc --noEmit
pnpm --filter cashfolio-app2 lint             # ESLint check
pnpm --filter cashfolio-app2 test:unit        # Run unit/integration tests
pnpm --filter cashfolio-app2 test:unit:coverage:ratchet # Run coverage + enforce no-regression baseline
pnpm --filter cashfolio-app2 coverage:ratchet:accept # Accept current coverage as new baseline (explicit follow-up step)
pnpm --filter cashfolio-app2 format           # Prettier check
pnpm --filter cashfolio-app2 prisma:generate  # Regenerate Prisma client (no DATABASE_URL required)
pnpm lint:workflows                           # actionlint check for GitHub workflows/actions
```

## cashfolio-app2 Working Conventions

- Follow the
  [UI capitalization guidelines](apps/cashfolio-app2/docs/ui-patterns.md#capitalization):
  use Title Case for short UI labels and titles, sentence case for prose,
  instructions, and status messages. Review visible copy and accessible names
  together.
- Use `User`/`user` for identities in app-owned code; reserve
  `Account`/`account` for the financial business entity. Use "Cashfolio account"
  for customer-facing identity references and "user" in admin actions, applying
  the general capitalization policy to labels. Explicit provider terms and
  documented legacy URLs are exceptions. See
  [Identity and financial-account terminology](apps/cashfolio-app2/docs/ui-patterns.md#identity-and-financial-account-terminology).
- Prefer Mantine styling; use CSS modules when manual styling is required.
- Import Prisma enums from `src/.prisma-client/enums` (not `@prisma/client`).
- Do not edit `src/routeTree.gen.ts` (generated file).
- Use `@tabler/icons-react` for icons.
- Use `@paralleldrive/cuid2` for unique IDs.
- Use `date-fns` for date operations.
- For server-side monetary math, use `decimal.js` to preserve precision (avoid
  native `number` arithmetic for money values).
- Use `react-number-format` for locale-aware number inputs.
- Use `en-CH` locale for number formatting.
- Keep currency/crypto constants in `src/currencies.ts` and
  `src/cryptocurrencies.ts`.
- In `src/routes/`, non-route files must be prefixed with `-` or live inside a
  `-`-prefixed private folder so TanStack Router skips them during route-tree
  generation. Files inside an ignored folder do not need their own `-` prefix
  (for example, `src/routes/$accountBookId/$accountId/-ledger/page-view.tsx`).
  Group larger route-local implementations by concern and colocate their tests
  and stories with the implementation.

## Quality Checklist

- Run `pnpm --filter cashfolio-app2 typecheck` before finishing code changes.
- Run `pnpm --filter cashfolio-app2 lint` before finishing code changes.
- Run `pnpm --filter cashfolio-app2 test:unit` before finishing code changes.
- Run `pnpm --filter cashfolio-app2 test:unit:coverage:ratchet` when touching
  tested app logic, so local checks align with CI coverage gating.
- When intentionally raising coverage baseline, run
  `pnpm --filter cashfolio-app2 coverage:ratchet:accept` and commit
  `apps/cashfolio-app2/coverage-baseline.json` in the same PR.
- Run `pnpm --filter cashfolio-app2 format` when touching formatting-sensitive
  files.
- Run `pnpm lint:workflows` when touching GitHub workflows or local actions.
- Run `pnpm --filter cashfolio-app2 e2e` for changes that bear a significant
  risk of breaking the application.
- If Prisma schema/client changes, run
  `pnpm --filter cashfolio-app2 prisma:generate`.
- Update relevant docs in `docs/` (shared) or app-local `docs/` folders when
  behavior or conventions change.

## Architecture References

- [Routing](apps/cashfolio-app2/docs/routing.md)
- [Server functions](apps/cashfolio-app2/docs/server-functions.md)
- [Account list valuation and reference balances](apps/cashfolio-app2/docs/valuation-reference-balances.md)
- [Database and Prisma](apps/cashfolio-app2/docs/database.md)
- [UI patterns](apps/cashfolio-app2/docs/ui-patterns.md)

# cashfolio-app2 Docs

Architecture and implementation patterns for `apps/cashfolio-app2`.

- [Routing](routing.md)
- [Server functions](server-functions.md)
- [Account list valuation and reference balances](valuation-reference-balances.md)
- [Valuation caching](valuation-caching.md)
- [Database and Prisma](database.md)
- [UI patterns](ui-patterns.md)
- [Testing (E2E)](testing.md)

## Storybook and Chromatic

Run Storybook locally from `apps/cashfolio-app2`:

```bash
pnpm --filter cashfolio-app2 prisma:generate
pnpm --filter cashfolio-app2 storybook
```

Build Storybook:

```bash
pnpm --filter cashfolio-app2 build-storybook
```

Run interaction tests (with Storybook dev server running on port `6006`):

```bash
pnpm --filter cashfolio-app2 test-storybook
```

### Storybook Coverage Guideline

- Keep Storybook **up-to-date and complete** for UI changes.
- When adding or changing UI components, update existing stories or add new
  stories in `src/**/*.stories.tsx` in the same PR.
- Include key states and important interaction paths, not only the default happy
  path.
- Before finishing, ensure Storybook is healthy:
  - `pnpm --filter cashfolio-app2 build-storybook`
  - run `pnpm --filter cashfolio-app2 test-storybook` when interaction behavior
    or story play functions changed.

Chromatic publishing:

- Workflow: `.github/workflows/build.yml` (`cashfolio-app2: Publish Storybook`
  job)
- Trigger: trusted pull requests (same repository), pushes to `main`, and manual
  `workflow_dispatch`
- Behavior: publish-only (`exitZeroOnChanges` + `exitOnceUploaded` +
  `autoAcceptChanges`) so CI does not block on visual/component review results
  and does not require baseline acceptance
- Pull requests from forks skip Storybook publishing to avoid exposing
  `CHROMATIC_PROJECT_TOKEN`
- For trusted pull requests, GitHub Environment `preview-cashfolio-storybook`
  uses Chromatic `storybookUrl` so PRs have a native deployment link to the
  latest Storybook preview
- For pushes to `main` (and manual workflow runs), GitHub Environment
  `staging-cashfolio-storybook` is used with the same Chromatic deployment URL
- Required secret: `CHROMATIC_PROJECT_TOKEN`

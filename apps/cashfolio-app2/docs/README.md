# cashfolio-app2 Docs

Architecture and implementation patterns for `apps/cashfolio-app2`.

- [Routing](routing.md)
- [Server functions](server-functions.md)
- [Account list valuation and reference balances](valuation-reference-balances.md)
- [Valuation caching](valuation-caching.md)
- [Database and Prisma](database.md)
- [Deployment](deployment.md)
- [UI patterns](ui-patterns.md)
- [Testing](testing.md)

## Storybook and Chromatic

For interactive development, start Storybook in a separate terminal. The server
command keeps running until you stop it:

```bash
pnpm --filter cashfolio-app2 prisma:generate
pnpm --filter cashfolio-app2 storybook
```

For local development or debugging, build Storybook with:

```bash
pnpm --filter cashfolio-app2 build-storybook
```

When local verification is justified by the
[verification policy](../../../CONTRIBUTING.md#verification-policy), run browser
render/interaction tests directly; no running Storybook server is required:

```bash
pnpm --filter cashfolio-app2 test-storybook
pnpm --filter cashfolio-app2 test-storybook:coverage
```

### Storybook Coverage Guideline

- Keep Storybook **up-to-date and complete** for UI changes.
- When adding or changing UI components, update existing stories or add new
  stories in `src/**/*.stories.tsx` in the same PR.
- Include key states and important interaction paths, not only the default happy
  path.
- Use the `cashfolio-app2: Storybook Tests` CI check for build and interaction
  verification of the current PR revision, including changes to story play
  functions. Do not duplicate it locally when it passes or while CI is pending
  or unavailable. Use the commands above only for development or a justified
  local investigation.

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

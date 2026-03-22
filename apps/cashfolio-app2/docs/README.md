# cashfolio-app2 Docs

Architecture and implementation patterns for `apps/cashfolio-app2`.

- [Routing and server functions](routing.md)
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

Chromatic publishing:

- Workflow: `.github/workflows/chromatic.yml`
- Trigger: every branch push and manual `workflow_dispatch`
- Behavior: publish-only with non-blocking visual changes (`exitZeroOnChanges`)
- Required secret: `CHROMATIC_PROJECT_TOKEN`

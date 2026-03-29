# Testing (E2E)

Scope: This document describes `apps/cashfolio-app2`. Unless noted otherwise,
paths are relative to that app directory.

## Framework

- E2E tests use **Playwright** with **Chromium**.
- Playwright config: `playwright.config.ts`
- Tests: `e2e/tests/`
- DB/setup helpers: `e2e/support/`

## Query Priority

When writing Playwright tests, follow Testing Library query priority:
https://testing-library.com/docs/queries/about#priority

Use this order whenever possible:

1. `getByRole` (with accessible name)
2. `getByLabel` / `getByPlaceholder`
3. `getByText` / `getByDisplayValue`
4. `getByAltText` / `getByTitle`
5. `getByTestId` only as a last resort

Guidelines:

- Prefer queries that reflect how users find and interact with UI.
- Do not add new `data-testid` attributes by default.
- Use `data-testid` only when semantic/accessibility queries are not practical
  (for example, some AG Grid internals or repeated icon-only controls without a
  stable accessible name).
- When adding a new `data-testid`, document briefly in the test why higher
  priority queries were not sufficient.

## Auth in E2E

E2E runs use a test-only auth bypass in `src/auth/functions.server.ts`.

Required env vars:

- `E2E_TEST_MODE=true`
- `E2E_AUTH_BYPASS=true`
- `E2E_AUTH_EXTERNAL_ID=<external-id-used-for-seeded-user>`

When bypass is disabled, app auth behavior remains unchanged.

## Valuation Provider Mocks in E2E

- When `E2E_TEST_MODE=true`, server-side external valuation calls
  (`currencylayer`, `coinlayer`, `marketstack`) are intercepted by MSW node
  handlers in `src/server/valuation/e2e-provider-mocks.server.ts`.
- In E2E mode, provider API-key checks also use a deterministic internal
  fallback key so no external provider secrets are required for these flows.
- This keeps E2E deterministic and avoids external provider traffic while still
  exercising valuation conversion logic end-to-end.
- The mocked rates/prices are fixed values intended for assertion stability.

## Database Lifecycle

- Tests run against PostgreSQL.
- Each spec file runs a full DB reset + seed in `beforeAll()`.
- Seeding creates:
  - a user with `E2E_AUTH_EXTERNAL_ID`
  - an account book and user-account-book link
  - root account groups
  - baseline asset/expense accounts used in core transaction flows

## Commands

Prerequisite for a fresh checkout:

```bash
pnpm --filter cashfolio-app2 prisma:generate
```

```bash
pnpm --filter cashfolio-app2 e2e:install
pnpm --filter cashfolio-app2 e2e
pnpm --filter cashfolio-app2 e2e:ci
```

Default local DB URL fallback for e2e is:

`postgresql://postgres:postgres@127.0.0.1:5433/postgres?schema=public`

## CI Execution Model

- App is built and served inside CI (`vite build` + `vite preview` via
  Playwright `webServer`).
- Postgres runs as a CI service container.
- Prisma migrations are applied in CI before e2e starts.
- Tests target only localhost app and CI-local Postgres.

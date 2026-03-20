# Testing (E2E)

Scope: This document describes `apps/cashfolio-app2`. Unless noted otherwise,
paths are relative to that app directory.

## Framework

- E2E tests use **Playwright** with **Chromium**.
- Playwright config: `playwright.config.ts`
- Tests: `e2e/tests/`
- DB/setup helpers: `e2e/support/`

## Auth in E2E

E2E runs use a test-only auth bypass in `src/auth/functions.server.ts`.

Required env vars:

- `E2E_TEST_MODE=true`
- `E2E_AUTH_BYPASS=true`
- `E2E_AUTH_EXTERNAL_ID=<external-id-used-for-seeded-user>`

When bypass is disabled, app auth behavior remains unchanged.

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

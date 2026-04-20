# Testing

Scope: This document describes `apps/cashfolio-app2`. Unless noted otherwise,
paths are relative to that app directory.

## Testing Pyramid

- **Unit tests (base layer)**: fast, deterministic logic tests with Vitest.
- **Integration tests (middle layer)**: multi-module server/controller behavior
  covered by Vitest suites in `src/**`.
- **E2E tests (top layer)**: user journeys and browser-level behavior with
  Playwright.
- **Storybook interaction tests**: component-level UI interaction validation via
  Storybook test runner.

## Unit and Integration (Vitest)

- Framework: **Vitest** (`vitest.config.ts`)
- Test files: `src/**/*.test.ts`
- Runtime: Node test environment
- Prisma client is generated before unit test runs via `pretest:unit`.
- Coverage output is report-only (no CI threshold gate yet) and published as CI
  artifacts.

Commands:

```bash
pnpm --filter cashfolio-app2 prisma:generate
pnpm --filter cashfolio-app2 test:unit
pnpm --filter cashfolio-app2 test:unit:coverage
```

Coverage artifacts are generated under `coverage/` (HTML + lcov + text summary).

## E2E (Playwright)

- E2E tests use **Playwright** with **Chromium**.
- Playwright config: `playwright.config.ts`
- Tests: `e2e/tests/`
- DB/setup helpers: `e2e/support/`

### Query Priority

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

### Auth in E2E

E2E runs use a test-only auth bypass in `src/auth/functions.server.ts`.

Required env vars:

- `E2E_TEST_MODE=true`
- `E2E_AUTH_BYPASS=true`
- `E2E_AUTH_EXTERNAL_ID=<external-id-used-for-seeded-user>`

When bypass is disabled, app auth behavior remains unchanged.

### Valuation Provider Mocks in E2E

- When `E2E_TEST_MODE=true`, server-side external valuation calls
  (`currencylayer`, `coinlayer`, `marketstack`) are intercepted by MSW node
  handlers in `src/server/valuation/e2e-provider-mocks.server.ts`.
- Unhandled requests to valuation provider hostnames fail fast in E2E, so URL
  mismatches cannot silently bypass mocks and hit real external services.
- In E2E mode, provider API-key checks also use a deterministic internal
  fallback key so no external provider secrets are required for these flows.
- This keeps E2E deterministic and avoids external provider traffic while still
  exercising valuation conversion logic end-to-end.
- The mocked rates/prices are fixed values intended for assertion stability.

### Database Lifecycle

- Tests run against PostgreSQL.
- Each spec file runs a full DB reset + seed in `beforeAll()`.
- Seeding creates:
  - a user with `E2E_AUTH_EXTERNAL_ID`
  - an account book and user-account-book link
  - root account groups
  - baseline asset/expense accounts used in core transaction flows

Commands:

```bash
pnpm --filter cashfolio-app2 e2e:install
pnpm --filter cashfolio-app2 e2e
pnpm --filter cashfolio-app2 e2e:ci
```

Default local DB URL fallback for e2e is:

`postgresql://postgres:postgres@127.0.0.1:5433/postgres?schema=public`

## Storybook Interaction Tests

Run Storybook tests against local Storybook server:

```bash
pnpm --filter cashfolio-app2 storybook
pnpm --filter cashfolio-app2 test-storybook
```

## CI Quality Gates

Current CI gates for `cashfolio-app2`:

- `typecheck`
- `format`
- `unit + coverage` (coverage is report-only)
- `e2e`

CI stores Playwright and unit coverage artifacts for troubleshooting and trend
tracking.

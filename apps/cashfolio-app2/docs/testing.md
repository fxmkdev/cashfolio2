# Testing

Scope: This document describes `apps/cashfolio-app2`. Unless noted otherwise,
paths are relative to that app directory.

## Verification Policy

When reviewing an existing PR, reuse CI results for its current revision rather
than repeating CI-covered checks locally, including inexpensive ones. Pending or
unavailable CI does not automatically trigger local replacements. Local checks
during review are reserved for concrete investigations, gaps in CI coverage, or
explicit user requests. Inspect failing CI logs and artifacts first, then run
the smallest useful local reproduction if needed.

During implementation, including fixes made during a review, run relevant
inexpensive local checks before pushing even when CI also covers them. Prefer
focused unit tests, typecheck, and lint/format checks scoped to the change where
practical. Choose checks based on the changed behavior and their actual cost;
avoid unrelated checks or repeating successful runs without new changes or a
specific reason.

Leave expensive full coverage runs, database-backed integration suites,
production builds, E2E, and full Storybook builds/tests to CI by default. Run
these locally only for a concrete investigation, a relevant gap in CI coverage,
or an explicit user request, using the smallest useful run.

Earlier green results do not validate later changes, and pending, missing,
skipped, cancelled, or inaccessible results are not passes. Report CI evidence
separately from any local execution. Commands below support both implementation
feedback and focused investigations.

See the repository's
[Verification Policy](../../../CONTRIBUTING.md#verification-policy) for
readiness requirements and exceptions for necessary setup, code generation, and
intentional coverage-baseline updates.

## Testing Pyramid

- **Unit tests (base layer)**: fast, deterministic logic tests with Vitest.
- **Integration tests (middle layer)**: multi-module server/controller behavior
  covered by Vitest suites in `src/**`.
- **E2E tests (top layer)**: user journeys and browser-level behavior with
  Playwright.
- **Storybook interaction tests**: component-level UI interaction validation via
  Storybook Vitest addon.

## Unit and Integration (Vitest)

- Framework: **Vitest** (`vitest.unit.config.ts`)
- Test files: `src/**/*.test.ts`
- Runtime: Node test environment
- Prisma client is generated before unit test runs via `pretest:unit`.
- Coverage output is published as CI artifacts, and a baseline ratchet prevents
  regressions versus the current baseline.

Commands:

```bash
pnpm --filter cashfolio-app2 prisma:generate
pnpm --filter cashfolio-app2 test:unit
pnpm --filter cashfolio-app2 test:unit:coverage
pnpm --filter cashfolio-app2 coverage:ratchet
pnpm --filter cashfolio-app2 coverage:ratchet:accept
pnpm --filter cashfolio-app2 test:unit:coverage:ratchet
```

Coverage artifacts are generated under `coverage/`:

- HTML report
- lcov report
- text summary
- JSON summary (`coverage-summary.json`)

Coverage ratchet behavior:

- Baseline is tracked in `coverage-baseline.json`.
- CI runs `test:unit:coverage:ratchet`, which fails if any of
  `statements`/`branches`/`functions`/`lines` drops below the baseline.
- When you intentionally improve coverage, update `coverage-baseline.json` in
  the same PR so future changes are measured from the improved baseline.
  Recommended workflow:

```bash
pnpm --filter cashfolio-app2 test:unit:coverage
pnpm --filter cashfolio-app2 coverage:ratchet:accept
pnpm --filter cashfolio-app2 coverage:ratchet
```

## Concurrent Mutation and Snapshot Integration Tests

`pnpm --filter cashfolio-app2 test:mutations` exercises public mutation handlers
against real PostgreSQL with only request authentication and Redis mocked. The
suites create and drop their own migrated disposable databases; they never
target `DATABASE_URL`. `MUTATION_TEST_ADMIN_DATABASE_URL` must point to a local
`postgres` maintenance database (default: `127.0.0.1:5433/postgres`).

Tests pause one writer after its book lock and observe the competing writer
waiting in PostgreSQL before allowing the first to commit. They cover hierarchy
cycles, sibling names, shared opening-balance account creation, cash
inheritance, archive/unarchive checks, start-date validation, and rollback. A
held-lock test keeps the holder active beyond 25 seconds, verifies the busy-book
rejection without writes, and then verifies an explicit retry after releasing
the lock. A cache-trigger deadlock test selects the public book-locking mutation
as victim and verifies a fresh transaction retries successfully without losing
the competing writer's changes. CI runs the suite in the PostgreSQL-backed
staging-seed integration job.

The same command also verifies period snapshots against real PostgreSQL. It
pauses a read after balance loading or between pagination queries, commits an
independent deposit or settings change, and verifies that the paused dataset
retains the earlier state while the next load sees the complete committed state.
It also freezes planner statistics in its disposable database, inserts a new
three-year household fixture after analyzing existing books, and loads four
yearly snapshots concurrently under the production transaction timeout. This
guards against slow subtype-exclusion query plans before the next automatic
`ANALYZE`, alongside a concurrent account-reclassification consistency check.

`e2e/tests/mutation-recovery.spec.ts` verifies rejected simple/split drafts,
archived selections, archive/delete confirmation errors, account/group edits,
and import review/inclusion preservation after a constraint refresh. The real
PostgreSQL busy-rollback scenarios live separately in
`mutation-recovery-reorder.spec.ts` and `mutation-recovery-unarchive.spec.ts` so
workers can schedule each lock wait independently. `withBookLock` always
releases the book lock, including when assertions fail; production lock-wait and
retry timing remains unchanged.

## Typecheck

`pnpm --filter cashfolio-app2 typecheck` checks application code, colocated
tests and stories, E2E tests, and handwritten TypeScript tooling. The app's
`tsconfig.json` includes root-level `.ts` configuration files and TypeScript
sources under `scripts/`, `eslint-rules/`, and `.storybook/`, including
Storybook configuration, preview decorators, setup, and stubs. New files in
these locations are included automatically; add any new tooling source
directories to the typecheck as well.

## Lint

- ESLint uses a flat config in `eslint.config.js`.
- The lint gate includes TypeScript, TanStack Router, and React Hooks checks.
- React Hooks dependency and Rules of Hooks violations are configured as errors
  and fail lint.

Command:

```bash
pnpm --filter cashfolio-app2 lint
```

## E2E (Playwright)

- E2E tests use **Playwright** with **Chromium**.
- Playwright config: `playwright.config.ts`
- Tests: `e2e/tests/`
- DB/setup helpers: `e2e/support/`
- The app's `typecheck` command includes all E2E tests, helpers, global setup
  and teardown, and `playwright.config.ts`. The existing CI typecheck gate
  checks these files too.
- General Settings, split-button actions, and statement-upload controls use
  `useHydrated` inside their lazy views to remain disabled in SSR until their
  own hydration commits. A root-level mount does not mean every Suspense
  boundary has hydrated. `hydration.spec.ts` holds client scripts to verify the
  disabled SSR controls, then releases them and verifies the first edit/upload
  is retained.
- Use `uploadStatementFile` from `e2e/support/ui` for statement uploads. Unlike
  a click or fill, Playwright's `setInputFiles` does not wait for an enabled
  control. Avoid fixed sleeps or retries to compensate for lost pre-hydration
  input. Segmented-control helpers rely on locator clicks to scroll and retry
  detached elements rather than separate `scrollIntoViewIfNeeded` calls.
- `e2e/tests/period-cache-revision.spec.ts` verifies the database-owned report
  cache revision against PostgreSQL: all financial tables, settings edits,
  rollback/commit visibility, bulk statements, concurrent commits, and recovery
  from book/child deadlocks with either writer selected as the victim. Cache
  unit tests separately cover Redis failures and loads spanning a commit.

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
- `E2E_AUTH_EXTERNAL_ID=<fallback-external-id-used-for-seeded-user>`

When bypass is disabled, app auth behavior remains unchanged.

### Valuation Provider Mocks in E2E

- When `E2E_TEST_MODE=true`, server-side external valuation calls
  (`currencylayer`, `coinlayer`, `marketstack`) are intercepted by MSW 3 node
  handlers in `src/server/valuation/e2e-provider-mocks.server.ts`.
- Unhandled requests to valuation provider hostnames fail fast in E2E, so URL
  mismatches cannot silently bypass mocks and hit real external services.
- The `onUnhandledFrame` callback checks HTTP frames and produces a local error
  response for unmatched provider requests. Unrelated traffic bypasses the
  mocks. The colocated `e2e-provider-mocks.server.test.ts` suite verifies real
  HTTP interception and initialization/cleanup behavior without provider
  credentials.
- In E2E mode, provider API-key checks also use a deterministic internal
  fallback key so no external provider secrets are required for these flows.
- This keeps E2E deterministic and avoids external provider traffic while still
  exercising valuation conversion logic end-to-end.
- The mocked rates/prices are fixed values intended for assertion stability.

### Database Lifecycle

- Tests run against PostgreSQL.
- The suite runs a one-time DB reset in Playwright global setup.
- CI runs three shards with two Playwright workers per shard. Playwright keeps
  `fullyParallel=false`, so workers run spec files in parallel while tests
  within a spec file remain serial.
- Each worker gets a unique e2e auth external id through `e2e/support/fixtures`.
- Each spec file seeds an isolated account-book-scoped dataset in `beforeAll()`
  for its worker-scoped user.
- Specs that need a different authenticated user can set the e2e-only
  `cashfolio-e2e-external-id` cookie. The auth bypass reads this cookie only
  when both `E2E_TEST_MODE=true` and `E2E_AUTH_BYPASS=true`.
- Seeding creates:
  - a user with the worker-scoped e2e external id
  - an account book and user-account-book link
  - root account groups
  - baseline asset/expense accounts used in core transaction flows

Commands:

```bash
pnpm --filter cashfolio-app2 e2e:install
pnpm --filter cashfolio-app2 e2e
pnpm --filter cashfolio-app2 e2e:ci
```

`e2e:ci` supports:

- `E2E_WORKERS` to control Playwright worker parallelism in CI; CI defaults to
  `2` workers per shard.
- `E2E_SHARD` to run a single Playwright shard (format: `index/total`).

Default local DB URL fallback for e2e is:

`postgresql://postgres:postgres@127.0.0.1:5433/postgres?schema=public`

## Storybook Interaction Tests

The shared preview loader creates and loads each story's memory router before
rendering. Keep that initialization ahead of play functions; mounting an
unloaded router can leave the canvas empty when a synchronous interaction query
runs. The decorator supplies the current story through React context so the
loaded router remains stable when story args change.

Storybook 10.6 applies preview annotations automatically. The browser project
uses the existing TanStack stubs and loaded memory router, runs every story in
headless Playwright Chromium, and clears local/session storage before each
story. Viewport parameters preserve the 1280×900 desktop default and 390×844
mobile story. Regression assertions check viewport dimensions, initial route
state, and storage isolation between stories.

The root Vitest config lists separate unit and Storybook projects. Unit scripts
invoke the unit config directly, retaining Node execution and `coverage/` for
the unchanged ratchet. Storybook coverage writes to `coverage-storybook/`; it
must never contribute to the unit ratchet. Vitest worker limits are global; the
root config limits browser tests to one worker, while unit scripts use their
independent config and retain their existing concurrency.

Pending-submit interactions should control when a mocked request resolves so
coverage overhead cannot end the pending state before disabled-action assertions
finish. Preserve the assertions and release the request before checking
recovery.

Run browser tests directly without starting a Storybook server:

```bash
pnpm --filter cashfolio-app2 test-storybook
pnpm --filter cashfolio-app2 test-storybook:coverage
```

For interactive debugging, optionally start Storybook in a separate terminal.
This command keeps running until you stop it:

```bash
pnpm --filter cashfolio-app2 storybook
```

## CI Quality Gates

Current CI gates for `cashfolio-app2`:

- `typecheck`
- `lint`
- `format`
- `unit + coverage` with coverage-ratchet enforcement
- `e2e` shards (`cashfolio-app2: E2E (Shard X/Y)`)
- fixed required gate check (`cashfolio-app2: E2E Required`)
- Storybook interaction/render tests (`cashfolio-app2: Storybook Tests`)

CI stores Playwright reports, Playwright JSON timing output, and unit coverage
artifacts for troubleshooting and trend tracking.

The mutation integration suite also uses a disposable PostgreSQL database for
Admin-role and user-deletion races. It pauses one operation after acquiring the
global advisory lock, verifies that the second operation is waiting in
PostgreSQL, and checks the final active-Admin count. Logto and authentication
are stubbed; financial and user-state reads/writes use the real generated Prisma
client.

## Temporal Browser Compatibility

Run `pnpm --filter cashfolio-app2 test:temporal:browser` after installing the
Playwright Chromium and WebKit browsers. This database-free Vitest suite covers
shared date helper contracts and real Mantine DateInput display/submission round
trips in UTC, Europe/Zurich, and America/Los_Angeles. Chromium checks native
Temporal; WebKit aliases the package entry point to its forced implementation so
Safari fallback behavior stays covered even when preview WebKit implements
Temporal. The tests do not patch globals.

Browser-only `*.browser.test.tsx` files are excluded from the Node unit suite.
Compatibility tests run separately from unit coverage and Storybook, with their
own CI job required before staging deployment. The coverage baseline is
unchanged. Run affected Node date/period tests with `TZ=UTC`,
`TZ=Europe/Zurich`, and `TZ=America/Los_Angeles` when investigating timezone
behavior.

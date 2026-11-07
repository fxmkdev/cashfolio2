# Module Ownership and Import Boundaries

Scope: `apps/cashfolio-app2`; paths below are relative to that app.

## Choosing an Owner

Keep code with its feature until reuse or a dependency boundary calls for a
shared owner. A pure function is not automatically a domain function: chart
colors and component configuration still belong to UI owners.

- **Shared domain contracts** describe data exchanged across features or between
  server and UI. Own standalone contracts in `src/shared/` and import them
  directly, including from server implementations. Do not derive shared
  contracts by importing server or UI implementation types. Public RPC facades
  may retain compatibility type re-exports and endpoint-inferred response types.
- **Shared pure logic** includes reusable calculations, validation, projections,
  formatting, and navigation models. It must run without React, UI libraries,
  request context, secrets, or database/provider access. Inject boundary inputs
  such as locale, storage, or conversion callbacks. Presentation-neutral labels
  and formatting do not by themselves require a component owner.
- **Shared UI** belongs in `src/components/<responsibility>/`, including themes,
  chart configuration, component props, controllers, and supporting helpers.
  Reusable hooks live in `src/hooks/`. Route-specific UI remains route-private.
- **Server implementations** own authorization, persistence, provider access,
  caching, and server-only calculations. A pure helper used only by a server
  domain can stay in that domain; sharing is deliberate, not mandatory.

Shared modules are grouped by domain rather than split into global `types/` and
`utils/` buckets. Colocate tests with their owners; use direct module imports
rather than adding forwarding files after moves.

Contracts consumed by multiple apps belong in a workspace package, such as
`@cashfolio/book-cache-contracts`. App-specific cache payload versions and key
builders remain in `shared/accounts/book-cache-keys.ts`; shared cleanup families
are imported from the package's public export.

| Shared group                   | Contents                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `accounts/`                    | Account/book contracts, validation, tree projections, organization, cache keys, and account-management models |
| `classification/`              | Asset classes, classification rules, and investment descriptors                                               |
| `reporting/`                   | Periods, History scopes, grouping, breakdowns, and gain/loss response contracts                               |
| `transactions/`                | Booking fields, transaction periods, bulk-action models, and transaction invariants                           |
| `units/`                       | Unit formatting, decimal precision, and valuation display models                                              |
| `resources/`                   | Resource limits, transport errors, fetch helpers, and mutation errors                                         |
| `navigation/`                  | Document titles, ledger return targets, and expansion preference adapters                                     |
| `users/`                       | User lifecycle response contracts shared by server implementations and UI                                     |
| `hierarchy-organize/`          | Generic hierarchy contracts and pure movement/structure algorithms                                            |
| `statement-import-csv-format/` | CSV format contracts, parsing, normalization, and validation; the existing adjacent facade is retained        |

Foundational `money.ts`, `date.ts`, `temporal.ts`, and `temporal-adapters.ts`
remain at the shared root. Import Temporal through `src/shared/temporal.ts`.
Currency and cryptocurrency constants keep their existing root owners.

For example, Report and History import dashboard colors from
`src/components/charts/dashboard-chart-theme.ts`. Shell dimensions belong to
`src/components/layout/`; the browser account-book options cache and its loader
belong to `src/components/account-book-navigation/`.

The deletion view imports `UserDeletionPreview` directly from
`src/shared/users/user-deletion.ts`; persistence-specific deletion planning
stays in the server implementation. Existing server type exports remain
compatible.

## Route Privacy and Server Facades

The first `-`-prefixed path segment under `src/routes/` establishes a private
module's owner: the directory immediately before that segment. Modules in that
subtree, including descendant routes, may import it. Siblings and ancestors may
not. Root-private helpers are available throughout the route tree, but not to
components or hooks. Type-only imports obey the same ownership rule. Move shared
UI out of routes when another owner needs it; do not add route-private shims.

Client-facing code imports server functions through the public facades listed in
`eslint.config.js`. These include stable root entry points such as
`src/server/accounts.ts`. Nested implementations, root implementation helpers,
and `.server` leaves are private, including their types. Add new public facades
to that explicit list when introducing an RPC entry point. Ordinary route
loaders are client-facing; API handlers under `src/routes/api/`, the server
entry point, and `.server` modules are server-only consumers.

Use `.server.ts` for application runtime leaves that access Prisma, Redis,
providers, secrets, Node APIs, or request context, including implementation
modules that transitively require them. Pure helpers and type-only modules keep
`.ts`. Modules defining `createServerFn` or `createServerOnlyFn`, and public
facades re-exporting those modules, remain client-importable `.ts` files.
Database operations also use `.server.ts` when they receive an injected Prisma
transaction rather than importing the global client. The account-query and
mutation concern folders follow these same rules; pure input readers and
type-only contracts retain `.ts`. Exported request-context helpers in those
modules must use `createServerOnlyFn`. Standalone seed/maintenance CLI owners
have explicit server-only entry points; they are not browser-importable
application facades.

## Automated Protection

`pnpm --filter cashfolio-app2 lint` runs ESLint and the runtime-cycle checker.
All new rules, helpers, and scripts are TypeScript and included in the app
typecheck; Node 26 loads tool sources using native type stripping.

- `cashfolio/no-ui-dependencies` rejects shared/server imports of components,
  routes, hooks, and root UI setup/context modules. Shared modules also cannot
  import server implementations or UI packages such as React, Mantine, Tabler,
  AG Charts/Grid, or number-input components, or Node/database/provider
  packages. Types follow these same boundaries.
- `cashfolio/module-boundaries` enforces route-private ownership, public server
  facade access, and the prohibition on production imports of test/story
  support. It checks imports, re-exports, literal dynamic imports (including
  templates), TypeScript import types/import-equals, and literal `require`
  calls. Both `@/` and normalized relative paths are checked.
- Tests, integration tests, stories, and deliberately named support modules may
  import across these boundaries. Support includes `testing/`, `test-support/`,
  `stories/`, `fixtures/`, `__tests__/`, `__mocks__/`, `__fixtures__/`, and
  `.test`, `.spec`, `.integration`, and story files, fixture filenames, and
  named test/story support directories and filenames identifying fixtures,
  helpers, harnesses, or setup (for example, `account-test-fixtures/` and
  `test-harness/`). Ordinary production helpers remain subject to the rules.
  Production modules cannot import support, even only for types. Keep support
  names explicit. Directory classification is relative to the app source root,
  so checkout ancestors do not grant exemptions.
- Build-gated E2E runtime seams under `src/e2e/` are application runtime
  modules, not blanket test-support exemptions. Their `.server` consumers and
  existing `__E2E_BUILD__` gates remain in place.

The cycle checker uses the TypeScript compiler API and app module resolution to
check eager value imports, value re-exports, side-effect imports, import-equals,
and literal `require` edges across production source. It prints a concrete cycle
path per cyclic component and fails without a baseline. Erased type
dependencies, generated code, test/story support, external packages, and lazy
dynamic imports are excluded. Computed imports and bundler-transformed edges are
outside this static check; bundle boundaries remain covered by CI builds.

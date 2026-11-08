# Architecture and Ownership Map

Scope: `apps/cashfolio-app2`; source paths are relative to that app unless a
workspace path is explicitly identified.

Use this map to find an owner, then follow
[module ownership and import boundaries](module-boundaries.md) for placement,
allowed dependencies, server-only filenames, and automated enforcement.

## Application Layers

| Owner                                             | Responsibility                                                                            | Entry points and guidance                                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Routes: `src/routes/`                             | URL contracts, loaders, navigation integration, and route-specific screens                | [Routing](routing.md); private implementations live under the owning route's first `-`-prefixed path segment                               |
| Shared UI: `src/components/`                      | Reusable feature views, controllers, dialogs, grids, and presentation models              | [Component organization](ui/layout-and-navigation.md#shared-component-organization); Accounts and Categories share `account-management/`   |
| Hooks: `src/hooks/`                               | Reusable React behavior                                                                   | [Custom hooks](ui/layout-and-navigation.md#custom-hooks-srchooks)                                                                          |
| Shared contracts and pure logic: `src/shared/`    | Cross-feature data contracts, validation, calculations, formatting, and navigation models | [Shared domains](module-boundaries.md#choosing-an-owner); no UI, server, database, or provider dependencies                                |
| Public server facades: `src/server/*.ts`          | Client-importable RPC entry points and compatibility exports                              | [Server-function pattern](server/request-boundaries.md#server-function-pattern); the explicit facade allowlist lives in `eslint.config.js` |
| Private server domains                            | Authorization, persistence, providers, caching, and server-only calculations              | Domain map below; clients reach implementations through public facades                                                                     |
| Infrastructure boundaries                         | Prisma/PostgreSQL, Redis, authentication sessions, and external valuation providers       | [Database](database.md), [authentication](server/authentication-and-users.md), and [valuation caching](valuation-caching.md)               |
| Workspace contracts: `libs/book-cache-contracts/` | Cache-cleanup contracts shared by the app and CLI                                         | Import `@cashfolio/book-cache-contracts` through its public package export; app payload versions and keys remain app-owned                 |

Routes compose shared UI and call public server functions. Server
implementations use their private domains and infrastructure boundaries. Both
layers import shared contracts directly from their owners; shared modules do not
depend back on either layer. Server-only runtime leaves use `.server.ts`; RPC
definitions and their public facades remain client-importable `.ts` modules.

## Server Domains

| Domain                     | Implementation owner                                                                                          | Guidance                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts and account books | `src/server/accounts/`: queries, mutations, hierarchy, organization, settings, and account gain/loss          | [Account organization](server/account-mutations.md#account-module-organization)                                                                                           |
| Transactions               | `src/server/transactions/`: validation, create/edit/import, deletion, and rebooking                           | [Transaction mutations](server/account-mutations.md#bulk-transaction-mutations)                                                                                           |
| Period reporting           | `src/server/period/`: base data, overview, History, reconciliation, allocation, caches, and transfer clearing | [Period organization](server/reporting.md#period-module-organization)                                                                                                     |
| Reusable holdings engine   | `src/server/holdings/`: FIFO state, basis, event processing, and reusable explain mapping                     | [Holding engine boundary](server/holdings-and-gain-loss.md#holding-gainloss-engine); report orchestration stays in Period, account caches stay in Accounts                |
| Valuation                  | `src/server/valuation/`: rate lookups, provider adapters, caching, and backtracking                           | [Provider adapters](server/request-boundaries.md#valuation-provider-adapters), [caching](valuation-caching.md), and [reference balances](valuation-reference-balances.md) |
| Authentication and users   | `src/auth/`, `src/account-books/`, and server user lifecycle modules                                          | [Sessions and user lifecycle](server/authentication-and-users.md)                                                                                                         |

The map identifies implementation ownership, not additional public import
surfaces. Client-facing code uses the configured facades; internal consumers
import their actual owner directly rather than adding forwarding modules.

## Tests and Supporting Material

Colocate tests, stories, and explicitly named support modules with their owner.
Feature-local `*.test-support.ts` harnesses register mocks before importing
tested modules; suites explicitly install their reset and cleanup hooks. Fixture
factories create fresh mutable state for each case. Production modules cannot
import test or story support, including only for types.

[Testing](testing.md) describes suite discovery and verification.
[UI patterns](ui-patterns.md) and [server functions](server-functions.md) index
focused implementation topics. Boundary and cycle checks run through the app's
lint command; [automated protection](module-boundaries.md#automated-protection)
documents their guarantees and limits.

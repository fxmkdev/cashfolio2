# Account List Valuation and Reference Balances

Scope: This document describes `apps/cashfolio-app2`. Unless noted otherwise,
paths are relative to that app directory.

Related docs:

- [Routing](routing.md)
- [Server functions](server-functions.md)
- [Testing (E2E)](testing.md)

## Overview

- The account list route (`$accountBookId/accounts.tsx`) renders `Balance` and
  `Balance (<referenceCurrency>)` columns.
- Route orchestration for this page is in
  `src/routes/$accountBookId/-accounts-page-controller.ts`, with focused helpers
  in:
  - `-accounts-page-modal-state.ts` (modal/edit/delete/archive/reorder state)
  - `-accounts-page-reference-balances.ts` (lazy reference-balance hydration and
    delayed loading indicator state)

## Account List Loading Strategy

- Initial page load requests account tree data with
  `includeReferenceBalances: false` to avoid blocking first paint on external
  valuation lookups.
- The route then lazily hydrates `Balance (<referenceCurrency>)` in the
  background for non-equity tabs.

## Valuation Providers and Caches

- Reference-currency conversion and account/group reference-balance assembly are
  implemented in `src/server/accounts-queries.ts` (re-exported via
  `src/server/accounts.ts`), using `src/server/valuation.server.ts`.
- Canonical provider/cache internals (provider responsibilities, key formats,
  logging sanitization, and cache behavior) are documented in
  [Valuation caching](valuation-caching.md), especially:
  - `Caching Layers`
  - `Provider Semantics and Cache Impact`
  - `How The Three Caches Differ`

## Data Quality Guardrails

- Canonical guardrails for provider data quality (for example non-positive
  market prices and no-data/miss cooldown handling) are documented in
  [Valuation caching](valuation-caching.md), under:
  - `Provider Semantics and Cache Impact`
  - `Core Lookup Algorithm`

## Redis Backtracking Caches

Backtracking uses both fallback and miss-cooldown Redis cache families.

Canonical definitions, key formats, and a concise three-cache contrast are
documented in [Valuation caching](valuation-caching.md), under:

- `Redis Fallback Cache (Backtracking Shortcut)`
- `Redis Miss-Attempt Cooldown Cache`
- `How The Three Caches Differ`

## Backtracking and Publish Window

Account-list reference-balance hydration uses the same valuation publish-window
and backtracking behavior as the shared valuation engine.

Canonical behavior is documented in [Valuation caching](valuation-caching.md),
under:

- `Historical Publish Window`
- `Core Lookup Algorithm`

## Reference-Balance Rules

- Ref-currency balances are populated for `Unit.CURRENCY`,
  `Unit.CRYPTOCURRENCY`, and `Unit.SECURITY` accounts.
- For `Unit.SECURITY`, account `Balance` is treated as quantity and converted as
  `quantity * securityPriceInTradeCurrency * tradeCurrencyToReferenceRate`.
- Group rows in `Balance (<referenceCurrency>)` show aggregated sums of
  descendant accounts across all units with available ref-currency balances
  (including `Unit.SECURITY`).
- If any descendant account has an unavailable (`null`) reference-currency
  balance, the group row remains blank to avoid displaying a partial aggregate.

## Runtime Environment

Required runtime env vars:

- `CURRENCYLAYER_API_KEY`
- `COINLAYER_API_KEY`
- `MARKETSTACK_API_KEY`
- `REDIS_URL` - must point to a Redis deployment with RedisTimeSeries module
  support (for example, Redis Stack)

`REDIS_URL` should point to the shared staging Redis (with RedisTimeSeries
support) when preview and staging should share valuation cache entries.

Dynamic PR preview deployment (`.github/workflows/build.yml`) sets:

- `CURRENCYLAYER_API_KEY` from `secrets.CURRENCYLAYER_API_KEY`
- `COINLAYER_API_KEY` from `secrets.COINLAYER_API_KEY`
- `MARKETSTACK_API_KEY` from `secrets.MARKETSTACK_API_KEY`
- `REDIS_URL` from `secrets.STAGING_REDIS_URL` (shared staging Redis)

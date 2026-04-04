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
- Currency valuation rates are requested from currencylayer historical API and
  cached in Redis TimeSeries keys
  (`valuation:currencylayer:USD:<TARGET_CURRENCY>`).
- Cryptocurrency USD prices are requested from coinlayer historical API and
  cached in Redis TimeSeries keys (`valuation:coinlayer:USD:<CRYPTO_SYMBOL>`).
- Security EOD close prices are requested from marketstack API and cached in
  Redis TimeSeries keys (`valuation:marketstack:<SYMBOL>:<TRADE_CURRENCY>`).
- Provider calls are logged for observability with sanitized URLs so access
  tokens/API keys are never written to logs.

## Data Quality Guardrails

- Non-positive security close prices (for example `0`) are treated as missing
  provider data, logged as warnings, and are not persisted to the permanent
  TimeSeries cache.
- When provider responses contain explicit no-data or missing-rate results,
  valuation backtracking writes per-series/per-day miss-attempt cooldown keys in
  Redis for 1 hour to avoid repeated provider calls for the same day while data
  is still unavailable.

## Redis Backtracking Caches

Backtracking uses both fallback and miss-cooldown Redis cache families.

Canonical definitions, key formats, and the fallback-vs-miss-cooldown difference
are documented in [Valuation caching](valuation-caching.md), under:

- `Redis Fallback Cache (Backtracking Shortcut)`
- `Redis Miss-Attempt Cooldown Cache`
- `Fallback vs Miss-Cooldown`

## Backtracking and Publish Window

- Backtracking first consults cached exact/prior rates; when the requested day
  is newer than the latest assumed-available historical publish window, the
  provider call is skipped and cached prior data is reused immediately.
- Historical fetches use a 00:05 UTC publish cutoff and 1-day lag for "latest
  fetchable date" calculation (before 00:05 UTC, treat the latest
  assumed-available day as two UTC days back).
- The 00:05 UTC cutoff is treated as an optimistic boundary, not guaranteed
  provider availability for every provider/day.
- A single latest-fetchable cutoff decision is computed once per top-level
  valuation request and reused across nested/parallel provider lookups to avoid
  mixed cutoff decisions around the publication boundary.
- When an exact date is not available, the newest available prior rate is used
  (first from cache, otherwise by historical API backtracking), and in-flight
  provider fetches are deduplicated per series/day.

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

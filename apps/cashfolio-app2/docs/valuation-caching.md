# Valuation Caching

Scope: This document describes the current valuation caching mechanism in
`apps/cashfolio-app2`. Unless noted otherwise, paths are relative to that app
directory.

## Why This Exists

Valuation lookups are needed to convert:

- currency balances
- cryptocurrency balances
- security quantities

into an account book's reference currency. External providers can be slow,
rate-limited, or missing data for specific dates. The caching design optimizes
for:

- low repeated provider calls
- deterministic daily (UTC) pricing lookup
- graceful behavior when Redis or providers are unavailable

## Where Valuation Is Used

Primary consumers:

- `src/server/accounts-queries.ts`
  - account tree reference balances
  - `getAccountReferenceBalances` lazy hydration endpoint
- `src/server/dashboard.ts`
  - historical booking conversion for income/expense charts

Exchange-rate entry points:

- `src/server/valuation.server.ts`
  - `getCurrencyExchangeRate`
  - `getCryptocurrencyToCurrencyExchangeRate`
  - `getSecurityToCurrencyExchangeRate`

## Caching Layers

There are five complementary layers:

1. Request-local Promise memoization
2. Redis TimeSeries daily rates
3. Redis fallback key-value cache for backtracked results and explicit no-data
4. Redis miss-attempt cooldown cache for day-level misses
5. In-process in-flight provider fetch deduplication (per series/day)

```mermaid
flowchart LR
  A["Accounts and Dashboard server functions"] --> B["Request-local Promise maps"]
  B --> C["valuation.server.ts"]
  C --> D["getRateWithBacktracking(...)"]
  D --> E["Redis TimeSeries daily series"]
  D --> F["Redis fallback key-value entries"]
  D --> H["Redis miss-attempt cooldown entries"]
  D --> I["In-flight provider dedup map"]
  I --> G["Provider APIs"]
  G --> D
  E --> D
  F --> D
  H --> D
```

## Request-Local Memoization

This deduplicates identical lookups during a single server-function execution.

- `src/server/dashboard.ts`
  - Uses `exchangeRateByKey: Map<string, Promise<number | null>>`
  - Keys include source, target, and booking date (`YYYY-MM-DD`) so repeated
    bookings on the same date reuse one in-flight lookup.
- `src/server/accounts-queries.ts`
  - Uses per-request maps for currencies, cryptocurrencies, and securities.
  - For account reference balances, all lookups use `today`, so memoization keys
    do not need an explicit date.

This layer is in-memory only and is cleared after each request.

## Historical Publish Window

Implementation:

- `src/server/valuation.server.ts`
- `src/server/valuation/date-utils.ts`
- `src/server/valuation/constants.ts`

Valuation lookups compute one shared `latestFetchableDate` per top-level request
and pass it into all nested lookups. This avoids mixed decisions near daily
provider publication boundaries.

Defaults:

- `HISTORICAL_DATA_DAY_LAG = 1`
- `HISTORICAL_DATA_AVAILABLE_AT_UTC_MINUTE = 5`

Meaning:

- at/after `00:05 UTC`, latest assumed-available day is `today - 1 day`
- before `00:05 UTC`, latest assumed-available day is `today - 2 days`

If a request date is newer than this cutoff, backtracking starts from the cutoff
instead of probing future-unavailable days.

## Redis TimeSeries Cache (Primary Historical Cache)

Implementation: `src/server/valuation/cache.ts` (`getCachedRate`,
`storeCachedRate`)

- Daily bucket timestamp: `Date.UTC(year, month, day)` from
  `toSeriesTimestamp(...)`.
- Reads:
  - First tries exact day hit via `TS.RANGE key timestamp timestamp`.
  - If not found, reads newest prior point via `TS.REVRANGE key - timestamp`.
- Writes:
  - `TS.ADD` with `ON_DUPLICATE LAST`
  - retention: `VALUATION_SERIES_RETENTION_MS = 10 years`

### Series Key Formats

- Currency (USD base to target):
  - `valuation:currencylayer:USD:<TARGET_CURRENCY>`
- Cryptocurrency (USD per crypto):
  - `valuation:coinlayer:USD:<CRYPTO_SYMBOL>`
- Security close price in trade currency:
  - `valuation:marketstack:<SYMBOL>:<TRADE_CURRENCY>`

Defined in `src/server/valuation/keys.ts`.

## Redis Fallback Cache (Backtracking Shortcut)

Implementation: `src/server/valuation/cache.ts`
(`getBacktrackedFallbackFromCache`, `storeBacktrackedFallbackInCache`,
`clearBacktrackedFallbackFromCache`)

When a request needed backtracking to find a usable older value, the result is
stored under a fallback key scoped to the exact requested timestamp. This avoids
repeating API backtracking for near-term repeated requests.

### Fallback Key Formats

- Currency:
  - `valuation:currencylayer:fallback:USD:<TARGET_CURRENCY>:<REQUESTED_TIMESTAMP>`
- Cryptocurrency:
  - `valuation:coinlayer:fallback:USD:<CRYPTO_SYMBOL>:<REQUESTED_TIMESTAMP>`
- Security:
  - `valuation:marketstack:fallback:<SYMBOL>:<TRADE_CURRENCY>:<REQUESTED_TIMESTAMP>`

### Fallback Payload Types

- `{ kind: "rate", rate, sourceTimestamp }`
  - TTL: `BACKTRACKED_FALLBACK_TTL_SECONDS = 3600` (1 hour)
- `{ kind: "noData" }`
  - TTL: `BACKTRACKED_NO_DATA_FALLBACK_TTL_SECONDS = 3600` (1 hour)

Backward compatibility is preserved for older entries missing `kind` (treated as
`rate` entries when `rate` and `sourceTimestamp` are present).

## Redis Miss-Attempt Cooldown Cache

Implementation: `src/server/valuation/cache.ts`
(`hasRecentMissedAttemptForSeriesTimestamp`,
`storeMissedAttemptForSeriesTimestamp`, `clearMissedAttemptForSeriesTimestamp`)

This cache suppresses repeated provider calls for a series/day that recently
returned no usable result during backtracking.

- key format:
  - `valuation:miss-cooldown:<SERIES_KEY>:<TIMESTAMP>`
- value:
  - sentinel `"1"`
- TTL:
  - `MISSED_ATTEMPT_COOLDOWN_TTL_SECONDS = 3600` (1 hour)
- lifecycle:
  - written when provider result is `NO_DATA_FETCH_RESULT` or `null`
  - cleared when a numeric rate is successfully fetched for that day

## How The Three Caches Differ

- TimeSeries cache:
  - Stores persistent daily numeric rates per valuation series.
  - Answers: "Do we already have an exact/prior historical rate to use?"
- Fallback cache:
  - Stores a short-lived result for one requested day (`rate` or `noData`).
  - Answers: "For this requested day, what should we return right now?"
- Miss-cooldown cache:
  - Stores a short-lived "recent miss" marker for one probed series/day.
  - Answers: "Should we skip retrying this provider day for now?"

## Core Lookup Algorithm

Implementation: `src/server/valuation/backtracking.ts`
(`getRateWithBacktracking`)

Behavior for a request date:

1. Normalize to UTC day timestamp.
2. Clamp probing start date to `min(requestedDate, latestFetchableDate)`.
3. Try TimeSeries cache.
4. If exact-day hit:
   - clear stale fallback key
   - return rate
5. If cached prior point is already new enough for the clamped start date:
   - clear stale fallback key
   - return cached prior rate
6. If fallback key exists:
   - `kind: "rate"`: return cached fallback rate
   - `kind: "noData"`:
     - return `null` when `stopOnExplicitNoData = true`
     - otherwise clear fallback and continue
7. Backtrack day-by-day up to `MAX_BACKTRACK_DAYS` (30):
   - if an older cached TimeSeries point is now in range, reuse and store
     fallback `kind: "rate"`
   - if miss-cooldown key exists for that day, skip provider call and continue
   - otherwise call provider via in-flight dedup map (`series + timestamp`)
   - on numeric rate:
     - store in TimeSeries
     - clear miss-cooldown key for that day
     - if backtracked day is older than requested day, store fallback rate
     - if exact day, clear fallback
     - return rate
   - on explicit no-data sentinel:
     - store miss-cooldown key for that day
     - usually store fallback `kind: "noData"` and return `null`
     - for securities only (`stopOnExplicitNoData = false`), continue
   - on `null`:
     - store miss-cooldown key for that day
     - continue backtracking
8. If loop ends and an older cached TimeSeries point exists, store fallback and
   return it.
9. Otherwise return `null`.

```mermaid
flowchart TD
  A["Request valuation for day D"] --> B["Compute requestedTimestamp"]
  B --> C["Clamp to latestFetchableDate"]
  C --> D["Read TimeSeries cache"]
  D --> E{"Exact day cached?"}
  E -->|Yes| F["Clear fallback key and return rate"]
  E -->|No| G{"Cached prior point covers clamped day?"}
  G -->|Yes| H["Clear fallback key and return cached prior rate"]
  G -->|No| I["Check fallback key"]
  I --> J{"Fallback hit?"}
  J -->|Rate| K["Return fallback rate"]
  J -->|NoData + stop| L["Return null"]
  J -->|NoData + continue or miss| M["Backtracking loop"]
  M --> N{"Miss cooldown key exists?"}
  N -->|Yes| O["Skip provider call and step back 1 day"]
  N -->|No| P["Fetch provider via in-flight dedup map"]
  P --> Q{"Result type"}
  Q -->|Number| R["Store TimeSeries, clear miss cooldown, update/clear fallback, return"]
  Q -->|NoData| S["Store miss cooldown; fallback noData or continue"]
  Q -->|Null| T["Store miss cooldown and continue"]
  O --> M
  S --> M
  T --> M
```

## In-Flight Provider Dedup

Implementation: `src/server/valuation/backtracking.ts`
(`inFlightProviderFetchByKey`)

Within a server process, provider calls are deduplicated by:

- key: `<seriesKey>:<timestamp>`
- behavior: concurrent requests for the same key await the same Promise
- cleanup: key is removed when the Promise settles

This is separate from request-local memoization and helps when multiple requests
hit the same uncached day concurrently.

## Provider Semantics and Cache Impact

Implementation:

- `src/server/valuation/providers.ts`
- `src/server/valuation/provider-response-parsers.ts`
- `src/server/valuation/provider-logging.ts`

Provider behavior:

- Currencylayer (`fetchUsdToCurrencyRateFromCurrencyLayer`)
  - returns USD->target currency rate
  - explicit no-data is mapped to `NO_DATA_FETCH_RESULT`
- Coinlayer (`fetchUsdPerCryptocurrencyRateFromCoinLayer`)
  - returns crypto->USD rate
  - explicit no-data is mapped to `NO_DATA_FETCH_RESULT`
- Marketstack (`fetchSecurityPriceFromMarketstack`)
  - returns security close in account trade currency
  - retries `429` up to 3 times with 1-second delay
  - explicit no-data is mapped to `NO_DATA_FETCH_RESULT`
  - quote-currency mismatch is treated as unusable (`null`)
  - non-positive close prices are treated as unusable (`null`)

Provider calls are logged with sanitized context so API keys are never logged.

## Conversion Formulas (After Cached Lookup)

Implementation: `src/server/valuation.server.ts`

- Currency:
  - `source -> target = (USD->target) / (USD->source)`
- Cryptocurrency:
  - `crypto -> target = (crypto->USD) * (USD->target)`
- Security:
  - `security -> target = (securityPrice in tradeCurrency) * (tradeCurrency->target)`

All symbols/currencies are normalized to uppercase before key creation and
lookup.

## Security-Specific Behavior

`getSecurityPrice(...)` calls `getRateWithBacktracking` with
`stopOnExplicitNoData: false`.

This means security valuations continue searching older days even when the
provider says the requested day has explicit no data, which is common around
non-trading days.

```mermaid
flowchart TD
  A["Provider returns explicit NO_DATA for security day"] --> B["stopOnExplicitNoData is false"]
  B --> C["Continue backtracking to prior UTC day"]
  C --> D["Found numeric price?"]
  D -->|Yes| E["Store TimeSeries point and fallback rate"]
  D -->|No| F["Continue until max backtrack window"]
```

## Constants That Control Behavior

Defined in `src/server/valuation/constants.ts`:

- `BASE_CURRENCY = "USD"`
- `MAX_BACKTRACK_DAYS = 30`
- `HISTORICAL_DATA_DAY_LAG = 1`
- `HISTORICAL_DATA_AVAILABLE_AT_UTC_MINUTE = 5`
- `VALUATION_SERIES_RETENTION_MS = 10 years`
- `BACKTRACKED_FALLBACK_TTL_SECONDS = 3600`
- `BACKTRACKED_NO_DATA_FALLBACK_TTL_SECONDS = 3600`
- `MISSED_ATTEMPT_COOLDOWN_TTL_SECONDS = 3600`
- Request timeouts (ms):
  - `CURRENCYLAYER_TIMEOUT_MS = 10000`
  - `COINLAYER_TIMEOUT_MS = 10000`
  - `MARKETSTACK_TIMEOUT_MS = 10000`

## Failure and Degradation Model

### Redis disabled or unavailable

Implementation: `src/redis.server.ts`

- Missing `REDIS_URL` logs one warning and returns `null` client.
- Redis connection failures log one warning and return `null` client.
- Valuation still works by calling providers directly; only cache benefits are
  lost.

### Cache read/write failures

Implementation: `src/server/valuation/cache.ts`

- Cache read failures degrade to provider lookups.
- Fallback cache read/write/delete failures are logged and ignored.
- Miss-cooldown cache read/write/delete failures are logged and ignored.
- Warnings are throttled with in-process boolean guards to avoid log spam.

### Provider/API failures

- Unexpected provider errors are thrown from provider helpers.
- Top-level valuation functions catch and log these errors, then return `null`
  so callers can continue rendering without crashing.

## Environment Requirements

Required for full valuation behavior:

- `CURRENCYLAYER_API_KEY`
- `COINLAYER_API_KEY`
- `MARKETSTACK_API_KEY`
- `REDIS_URL` (Redis with TimeSeries support)

Without provider keys in normal runtime, related conversions return `null` and
log a one-time warning. In `E2E_TEST_MODE=true`, provider key lookup uses a
special mocked key path for test flows.

## Practical Notes for Contributors

- Do not edit key formats casually. Existing cache history and fallback keys
  depend on stable naming in `src/server/valuation/keys.ts`.
- Keep `latestFetchableDate` logic (`getLatestAssumedAvailableHistoricalUtcDay`)
  aligned with provider publish behavior.
- Keep date handling on UTC day boundaries (`toSeriesTimestamp`, `toUtcDay`).
- If tuning backtrack or TTL constants, update:
  - `src/server/valuation/constants.ts`
  - this document
  - tests in `src/server/valuation/backtracking.test.ts` as needed

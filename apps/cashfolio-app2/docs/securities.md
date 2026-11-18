# Securities Discovery

The authenticated **Securities** page at `/$accountBookId/securities` searches
Marketstack on demand. The account-book parent route authorizes book access;
every discovery/history RPC independently requires an active authenticated user.
Reference data has no user, book or financial-account associations. Discovery
and **Copy Symbol** do not change account creation or valuation.

## Ownership and browsing

- `src/shared/securities/` owns transport contracts and labels.
  `src/server/securities.ts` is the public RPC facade; its private domain owns
  validation, provider access, signed references and caching.
- `src/components/security-search/` owns the view and cancellable controller.
  The private route supplies real services. Shared DataGrid uses server-side
  20-row blocks/pages with informational Name, Symbol, Exchange, Country and
  Historical Prices columns. All sorting and column filters are disabled.
- Nothing loads listings or prices on navigation. Search/Enter submits the
  name/symbol query and optional single exchange MIC. An explicitly submitted
  empty query browses all listings. Editing draft controls does not fetch.
- Opening Exchange first loads its directory; typing filters cached choices
  locally. Labels are Exchange Name (MIC); clearing means All Exchanges.
  Directory failures offer their own retry and do not block all-exchange search.
- Submission resets pagination and selection. Page changes preserve the selected
  listing. Desktop details scroll independently; below `64em`, details hide the
  mounted grid. Back/close restores focus and browsing state.
- Abort signals cancel replaced searches/history and unmounted work. Obsolete
  responses cannot replace another listing or update the current grid summary.

Open **Routes/Securities** in Storybook. Fixtures emulate provider ordering,
explicit submission, exchange choices and requested pages, plus chart/copy,
responsive layouts, partial history and cooldowns. They never call Marketstack
or the backend and make no provider-coverage or currency claims.

## On-demand provider pages and cache

Discovery uses GET `/v2/tickerslist` with `search`, optional `exchange`,
`limit=20` and the requested `offset`, following the
[Marketstack v2 specification](https://docs.apilayer.com/marketstack/docs/marketstack-api-v2-v-2-0-0).
Each cache miss fetches only that page, in provider order. No background page
prefetch, catalogue scan, local column filtering/sorting or row-price enrichment
runs. Pagination totals come from the provider and are not snapshot-pinned;
provider changes can move rows between independently cached pages. Malformed
listing pages fail visibly without scanning replacement pages.

Validated pages, including empty results, are cached in Redis for **24 hours**
under `securities:marketstack:search:v1:`, keyed by exact submitted search,
optional exchange, limit and offset. The lightweight `/v2/exchanges` directory
is paginated separately and cached for **seven days** under
`securities:marketstack:exchanges:v1`. Directory loading is bounded to 10,000
entries and the normal read deadline. Unknown listing metadata remains Unknown;
discovery never loads profiles or historical prices to fill result columns.

Cache payloads are validated before use. Corrupt/unavailable Redis retains
bounded provider fallback. Failed operations are not cached as empty successes.
Concurrent work reuses the existing user-scoped shared-work mechanism and
provider-attempt budgets. Search and directory caches contain public metadata;
credentials and selection-signing keys remain server-only.

## Trusted selected-listing references

Every validated result receives a stable SHA-256 ID over its exact symbol/MIC
and a signed reference containing its listing metadata, format version and
24-hour expiry. HMAC-SHA-256 uses a purpose-specific key derived from
`SESSION_SECRET`. References are issued when serving a page; they do not require
a catalogue row, Redis lookup or extra provider call to resolve. Signature
comparison is timing-safe, and payload bounds, version, metadata and expiry are
checked before history access. Invalid/expired references require a new search.
Secret rotation invalidates outstanding references.

Symbols such as `NEE 6.219` and vendor exchange identifiers such as `XETRA` and
`NMFQS` are preserved exactly. Client-supplied symbols or metadata cannot
replace the signed identity. A valid reference still requires an authenticated
active user; reference metadata itself is shared public reference data.

## Selected-listing history

The history operation verifies the signed selection reference, then requests all
paginated `/v2/eod` rows over the previous five years through the current UTC
accounting day. It validates exact exchange/symbol matching, pagination, dates,
unadjusted closes and duplicate days, sorts chronologically, and rejects mixed
quote currencies/units. Currency and security type come only from matching EOD
metadata. Missing metadata remains Unknown. Rows without a MIC are copyable but
cannot safely request history. A confirmed `has_eod: false` skips retrieval;
unknown availability still attempts it.

A missing/null, non-positive, non-finite or non-numeric close is an omitted
observation, not a reason to discard valid prices. Strings are never coerced.
Omissions carry their provider date and a reason (`missing`, `non-positive`, or
`invalid`); raw provider row counts still drive pagination. Identity, date,
duplicate-day, currency/unit and pagination checks remain strict, including on
omitted observations. Matching metadata can still supply currency/type when all
closing prices are unusable. The provider-declared availability flag is
unchanged.

The RPC preserves listing/points/window fields and adds `status`, dated
`omissions`, and—for `unavailable` results—a reason (`no-data`,
`no-usable-prices`, or `invalid-data`), safe message and UTC `retryAt`. Range
controls filter prices and omissions locally. Partial history shows an omission
count; explicit missing observations break the chart line and enable small point
markers. Weekends and other unreported days do not create gaps. Latest-close
labels always use valid prices. A range with only omissions has a different
message from a range without observations.

Usable complete or partial history is cached in Redis for 24 hours under
`securities:marketstack:history:v2:` using symbol, MIC, requested window and UTC
through-day. No-data, all-unusable and deterministic validation failures are
cached for five minutes. Retry is disabled until the returned retry time, then
re-enabled without automatic fetching; there is no force-retry parameter.
Configuration, authentication, quota, cancellation and transient transport
failures are not negative-cached. The namespace and payload are separate from
valuation caches. Payloads, including omissions and cooldowns, are validated on
read; older v1 entries expire normally and are not read. Redis failure retains
bounded live fallback, so server cooldown persistence depends on Redis, while
the visible client still respects an already received retry time.

Each HTTP attempt is recorded once. Usable pages are `RETRIEVED`; pages without
usable prices are `NO_DATA`; fatal provider validation remains `PROVIDER_ERROR`.
Omission diagnostics contain counts and at most five date/reason/type samples,
with a numeric value only when finite. No arbitrary provider strings, full
responses, URLs or credentials are logged. Cache hits make no provider calls.
The partial-history and cooldown stories use local fixtures; the interactive
cooldown story compresses five minutes to two seconds to exercise expiry.

Provider requests reuse `MARKETSTACK_API_KEY`, timeout/rate-limit retry
constants, resource-budget accounting and sanitized provider usage. A timed-out
request, network failure, unreadable HTTP payload or HTTP 5xx response retries
the same page at most twice, with bounded delays inside the existing deadline.
Cancellation and structurally invalid provider data never retry. Every HTTP
attempt is reported with `SECURITY_SEARCH`, `SECURITY_EXCHANGES`,
`SECURITY_HISTORY` or `RATE_LIMIT_RETRY`. Configuration, subscription/quota,
malformed data and transient errors have separate safe messages. Existing
financial-account valuation is unchanged.

## Deployment and schema compatibility

There is no catalogue refresh worker, scheduled/manual refresh workflow,
deployment initialization, preflight, smoke request or refresh payload in the
app image. Deployment and warm-up do not access Marketstack. No manual bootstrap
is needed: user actions request pages and selected history only when needed.

The existing catalogue migration, Prisma models/tables, data and legacy
`CATALOGUE_REFRESH` usage records remain intact temporarily. No runtime
Securities path reads them. Do not reset databases, rewrite applied migrations,
or run destructive cleanup. A new additive migration adds `SECURITY_SEARCH` and
`SECURITY_EXCHANGES` usage reasons; normal Prisma deployment applies it.

## Verification and cost

Focused tests cover authentication, query/provider validation, exact requested
pages/order, cache hits/TTLs/corruption, signed identity/expiry, history parsing
and cooldowns. Mocked E2E uses build-gated ticker/exchange/history responses,
requires no catalogue seed, and blocks unhandled provider traffic. Full suites,
coverage, builds and mocked E2E runs remain CI checks.

Make **no live Marketstack calls** during implementation or verification and
trigger no refreshes. Verification uses fixtures/mocks only. Overage is **USD
0.003996 per request**, against the stated **USD 20 maximum additional cost**.
The pivot adds no aggregate runtime spending guard; provider/account limits
control aggregate spending. Existing request budgets bound individual
operations. Cache hits make no provider requests, while cache misses, directory
pagination and bounded retries consume requests. There is no recurring full
catalogue cost.

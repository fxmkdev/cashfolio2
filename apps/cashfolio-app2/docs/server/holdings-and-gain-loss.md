# Holdings and Gain/Loss

Scope: `apps/cashfolio-app2`; source paths are relative to that app.

[Server functions](../server-functions.md) ·
[Architecture and ownership](../architecture.md)

### Holding Gain/Loss Engine

The independent server domain at `src/server/holdings/` owns reusable holding
pricing, transfers, chronological replay, FIFO matching, and open-lot valuation.
Account gain/loss, Period overview, History, and reconciliation consume its
explicit internal entrypoints:

- `engine.server.ts`: initialize, apply transactions, replay pending executions
  without closing valuation, finalize, combined calculation, and open-lot
  inspection
- `transactions.ts`: transaction decomposition, prefetch classification, unit
  identity, multi-unit detection, and date-window membership
- `types.ts`: named operation inputs, Decimal state/results, conversion/rate
  callbacks, and explain payload contracts
- `lots.ts` and `quantity-policy.ts`: priced FIFO execution for the synthetic
  transfer-clearing adapter and the shared quantity threshold/near-zero policy
- `events.ts`: event-series calculation, grouping, ordering, and convertible
  holding selection
- `explain.ts`: acquisition-key parsing, realized-event/open-lot mapping, and
  running unrealized totals, retaining rounded and unrounded modes

Pricing, transfer receipts, replay scheduling, account finalization, and
matching helpers are private implementation modules. Consumers use the
entrypoints above; there is no general barrel. The domain depends on shared
money/date/contracts, Prisma enums, and server resource-budget checks, never on
Period or Accounts. Caller-supplied converters/resolvers retain valuation
scheduling and memoization.

Calculation entrypoints sequence private stages rather than combining their
mechanics. Execution pricing separates ordered conversion and counters, pricing
strategy, residual allocation, and event construction. Account finalization
separates replayed-event emission from closing valuation. Replay scheduling,
quantity simulation, and rescheduling have separate owners; transaction matching
separates graph construction, augmenting paths, and match assembly. Transfer
receipts separately select carried lots, close opposite positions, insert the
remaining basis, and assemble explain events. Mixed-period transfers prepare
conversions once before applying their dated carry legs.

`period/holdings/period-holding-gain-loss.server.ts` remains the period adapter.
It prepares opening balances and virtual transfer-clearing accounts, batches
synthetic transactions, accumulates report contributions, and combines holding
results with period execution-residual realization. Residual attribution,
loaders, and report assembly stay in Period. Account gain/loss owns its
basis/summary caches, availability propagation, diagnostic presentation, and
private-copy revaluation.

Within Accounts, `gain-loss/basis-diagnostics.server.ts` owns affected-account
indexing and propagation of unavailable basis. `valuation-state.server.ts` owns
private copies, closing-rate warmup, and availability assembly;
`valuation-details.ts` collects unrounded detail callbacks. The calculation
entrypoint retains basis publication and phase sequencing. Period holding
orchestration similarly delegates opening balances, synthetic batches, and
contribution callbacks. Execution residuals separate selection, conversion, and
attribution; transfer-clearing calculation separates opening basis, execution
pricing, and closing valuation. Global transfer-clearing totals are updated in
execution order, not recomputed from per-unit totals, because regrouping Decimal
additions can change cancellation.

Accounts and transactions retain their existing processing order, Decimal
precision, quantity threshold, pricing fallbacks, counters, and explain callback
order. Reusable explain mapping does not force rounding: account details retain
full precision while period reconciliation keeps its existing rounded amounts
and running totals. Period-specific summaries, diagnostics, and virtual-account
IDs stay in reconciliation. Public server facades retain their exports; internal
consumers import their actual owner directly. Working-state cache shapes,
codecs, keys, and publication boundaries remain unchanged.

Holding and consumer tests are grouped by behavior, with colocated typed
`*.test-support.ts` fixtures. Fixtures create mutable state per case. Mocked
prefetch, Decimal-pipeline, and reconciliation suites use feature-local
harnesses that register hoisted mocks before dynamically importing the tested
modules; they export local module bindings rather than direct re-exports that
could load dependencies before mock registration. Each suite explicitly installs
its reset, fake-timer, and cleanup hooks. Parameterized cases, concurrency
gates, snapshot no-reread assertions, and full test names remain intact when
suites are split.

## Accumulated Account Gain/Loss

`src/server/account-gain-loss.ts` exposes authorized GET functions for
account-list summaries and individual-account summaries/details. The range
loader in `src/server/accounts/gain-loss/range.server.ts` uses account-book
start, the existing opening balance date, UTC as-of dates, shared holding
transaction queries, and valuation conversions. Its metadata, opening balances,
transactions, and group hierarchy share one read-only RepeatableRead snapshot;
valuation requests and FIFO replay run after that transaction completes. All
relevant real accounts participate before active/archived and balance-scope
display filtering.

`calculateAccountGainLoss` reuses the shared holding FIFO/pricing engine with
chronological replay and per-account callbacks. Shared transaction decomposition
recognizes partial same-unit transfers alongside fee, cash, and other holding
bookings. Valuation prefetch uses the residual booking quantities and memoizes
conversions by original booking ID plus exact quantity. Incomplete-basis
transfer dependencies come from these matched groups. Transfer source routing
remains attached only to temporary replay pools, not persisted open lots. Its
completeness diagnostics propagate missing basis through transfers, and its
optional detail collection retains exact amounts until the numeric serialization
boundary. Transfer receipts match opposing destination lots at each carried
acquisition cost and attribute realised G/L to the destination. Reconciliation
emits one `transferBasis` event per matching receipt (including zero-gain
matches), with the matched quantity, weighted-average carried price, individual
FIFO match prices, and a null `pricing.marketReferenceAmount`. Unmatched
quantities keep their original costs and acquisition order. Split receipt events
use distinct IDs for transfer-basis and execution portions while retaining the
original booking/transaction links. Market-fallback portions also have distinct
event and acquisition-lot identities. Existing period loaders retain their
period-opening valuation and rounding semantics. Accounts-list accumulated G/L
uses the summary cache described below; valuation caches and request-local rate
deduplication remain shared.

### Accounts-list accumulated G/L summary cache

`src/server/accounts/gain-loss/cache.server.ts` caches one book-wide summary
dataset, including leaf diagnostics and account/group view metadata. Filtering
by persisted type (`BALANCE` or `EQUITY`), account state, and Decimal
group/footer aggregation happen after retrieval. Accounts requests `BALANCE`
with the `all` state; group metadata includes archived state so the shared
display projection can aggregate virtual Archived groups from account leaves.
Summary v4 and basis v3 ignore older payloads without this metadata.
Authorization runs before cache access. Ledger summaries bypass this
final-summary cache but share the historical basis cache below. Calculation
drawers bypass both caches.

- Key:
  `account:gain-loss:v5:{PERIOD_BASE_CACHE_ENV}:{accountBookId}:{revision}:{asOfDate}:{latestFetchableDate}`.
  Dates are UTC `YYYY-MM-DD`; both days are captured before loading. The latest
  fetchable day uses the shared valuation publication-window rules.
- TTL is 24 hours; maximum encoded size is 512 KiB. The shared Decimal codec
  preserves exact values, and reads validate the decoded summary structure.
  Payloads exclude transactions, FIFO detail events, and internal cache
  metadata.
- Every lookup reads the committed PostgreSQL revision, including warm hits.
  Per-user inflight jobs use the entire key, preventing loads after a mutation
  from joining an older calculation. Subscriber cancellation and budgets remain
  independent; jobs own their signals and bounded resource contexts. Only the DB
  snapshot runs inside the existing read-only repeatable-read transaction;
  valuation runs afterwards.
- Persistence requires identity/stable TimeSeries valuation sources, a snapshot
  revision matching the lookup revision and a final DB revision read, and an
  unchanged publication cutoff. Provider/fallback/missing results still answer
  the request without persistence. Database-only completeness diagnostics retain
  their existing meaning and are invalidated by revision/day changes.
- Missing Redis or failed revision reads bypass caching. Malformed or oversized
  entries and Redis command failures fall back to calculation. Read/write
  warnings are throttled per process; the existing required environment
  namespace behavior applies. Obsolete generations expire naturally, and shared
  key-family helpers include this cache in book/user deletion and restore
  cleanup.

A warm hit skips historical DB inputs, valuation, and FIFO replay. Misses use
historical basis caching before falling back to a complete replay.

### Recorded G/L in Since-Start Summaries

Account-list and ledger G/L Since Start includes recorded Gain/Loss adjustments
in Realised and Total, using the same counterpart attribution, signs, and
booking-date conversion as Report/History. Calculated Unrealised is unchanged.
The summary labels remain Realised; help text explains the recorded component.
The calculation response includes `recordedAdjustments` source rows separately
from FIFO events, with links to complete transactions.

Reference-currency balance accounts become eligible when recorded adjustments
exist in the book-start/as-of range, even if they net to zero.
`getAccountRecordedGainLossEligibility` authorizes the book and checks that
range and attribution without conversions or FIFO replay. Its input query is
limited to transactions involving the target account; counterpart resolution
still checks all financial legs so ambiguous legacy entries remain excluded.
Tracking Method does not restrict eligibility. Historical basis cache v4 stores
exact recorded totals/eligibility; summary cache v5 includes the combined
results. Missing recorded conversions withhold Realised and Total and prevent
basis persistence.

### Accumulated G/L historical basis cache

`src/server/accounts/gain-loss/basis-cache.server.ts` supplies the Accounts-list
cache and ledger summaries with book-wide realised G/L and open FIFO lots. The
calculation separates chronological execution/transfer replay from closing
valuation. A basis hit needs only lightweight validity reads and closing-price
lookups; it does not load historical transactions or reprice executions.
Calculation drawers still replay independently, using the same stages and
retaining detailed execution explanations. Period Report and History use the
shared matching rules with their own period-opening bases and do not use this
historical basis cache.

- Key:
  `account:gain-loss-basis:v4:{PERIOD_BASE_CACHE_ENV}:{accountBookId}:{revision}:{watermark}`.
  The watermark is the latest booking timestamp strictly before the day after
  the requested UTC as-of day, or `empty`. All book bookings participate
  conservatively. Revision and watermark are read together in a read-only
  RepeatableRead transaction. This allows reuse across days and historical
  periods with identical effective bookings while detecting already-posted
  future bookings becoming effective without a database mutation. Dates before
  book start bypass basis caching.
- Payloads include book/account/group metadata, exact Decimal realised amounts,
  and remaining lots with acquisition order. They exclude raw transactions,
  execution explanations, and closing prices. Closing valuation uses a private
  state copy. TTL is seven days, with a 2 MiB encoded limit and shared
  Decimal/date codec; reads validate the structure and holding metadata.
- Only complete bases can persist. Opening/execution dependencies must use
  identity or stable TimeSeries results; non-identity valuation dates must also
  be no newer than the publication cutoff captured before replay. This prevents
  a recent execution priced using the latest available prior day from becoming
  frozen across daily publication boundaries. Missing basis, partial postings,
  incomplete metadata, provider results, and temporary fallback prices prevent
  persistence. Missing or temporary **closing** prices do not prevent basis
  persistence and are retried on subsequent summary requests.
- Cold replay includes its watermark in the same snapshot as historical inputs.
  Persistence checks matching lookup/snapshot revisions and watermarks, a final
  committed revision read, and an unchanged publication cutoff. Revision or
  watermark changes rebuild the complete basis; incremental replay is not used.
- Inflight requests share work by basis key, requested as-of date, and
  publication cutoff so different closing dates never share a final result.
  Rejected loads are removed for retry. Missing Redis, validity-read failures,
  malformed or oversized entries, and cache-command failures fall back to full
  calculation. Authorization and required environment namespace behavior remain
  unchanged.
- Shared book-cache helpers include this family in book/user deletion and
  restore cleanup. Obsolete revisions expire naturally. No migration is needed.

The outer Accounts summary cache retains its 24-hour TTL, date/publication keys,
and valuation-source rules. Historical basis and final-summary cacheability are
tracked separately, so final summaries still cannot freeze temporary prices.

G/L summary v3, historical basis v2, and History metrics v8 do not reuse earlier
generations computed before partial-transfer recognition. Their valuation-source
policies also continue to exclude temporarily backtracked TimeSeries quotes. Old
entries expire naturally under their existing TTLs and remain covered by
version-independent book/user deletion and restore cleanup. Global price/rate
series and their fallback/cooldown caches are preserved.

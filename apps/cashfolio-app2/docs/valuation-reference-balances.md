# Account List Valuation and Reference Balances

Scope: This document describes `apps/cashfolio-app2`. Unless noted otherwise,
paths are relative to that app directory.

Related docs:

- [Routing](routing.md)
- [Server functions](server-functions.md)
- [Testing (E2E)](testing.md)

## Overview

`Account.assetClass` is manually selected reporting metadata. Unclassified is
the default for both existing and new accounts. Classification does not select
valuation providers or change balances, cash-flow eligibility, FIFO, execution
pricing, or realized/unrealized gain/loss calculations. `Unit` and the existing
currency/cryptocurrency/symbol/trade-currency fields continue to determine
conversion and pricing. A currency-denominated equity portfolio can therefore
use the Equities asset class while retaining automatic FX conversion. Manual
balance adjustments remain ordinary Gain/Loss transactions.

**Include in Cash Flow** is a separate setting stored in
`Account.isCashAccount`. It selects currency balance accounts for cash-flow
reporting; transfers entirely between included accounts are excluded from cash
flow. Selecting the Cash & Cash Equivalents asset class does not enable this
setting, and changing cash-flow inclusion does not change the asset class. Child
accounts inherit cash-flow inclusion from their parent group.

Report offers Account Structure and Asset Class grouping for Assets,
Liabilities, and Gain/Loss. History offers the same two lenses within its
Gain/Loss View selector. Both use the current account structure/classification
for all periods, including archived accounts. Asset classes remain flat, with
Unclassified for accounts without a class. Changing classification moves
contributions between reporting classes without changing valuation, balances, or
total gains/losses. Calculated and recorded contributions are combined per
account, including reference-currency recorded adjustments; their provenance
remains available in reconciliation.

Investment groups below asset class use currency/cryptocurrency codes or
security symbols, combining trade currencies for the same symbol. Currency
accounts marked `trackingMethod = TOTAL_PORTFOLIO_VALUE` appear under Managed
Portfolios instead; their recorded and calculated FX returns stay together.
Tracking method is current reporting metadata, independent of valuation and FIFO
identity, and applies to all historical periods.

- The account list route (`$accountBookId/accounts/route.tsx`) renders `Balance`
  and `Balance (<referenceCurrency>)` columns.
- Route orchestration for this page is in
  `src/routes/$accountBookId/accounts/-page-controller.ts`, with focused helpers
  in:
  - `-page-modal-state.ts` (modal/edit/delete/archive/reorder state)
  - `-page-reference-balances.ts` (lazy reference-balance hydration and delayed
    loading indicator state)

## Archived groups and totals

Accounts shows balance accounts and active/archived real items together.
Directly archived children of an active group, or archived roots, appear beneath
a virtual **Archived** group. Archived real groups retain their complete
original subtrees; no further virtual wrappers are inserted inside them. Empty
virtual groups are omitted. Virtual groups start collapsed, remember expansion
per book in the session, remain last among siblings even during column sorting,
and have no mutation actions. A real group named Archived remains an ordinary
editable group.

Virtual name cells use a muted archive icon and label, with the tooltip
“Archived items grouped automatically. Included in totals.” on hover and
keyboard focus. Chevrons and monetary columns retain normal contrast.

The hierarchy projection changes display parents only. Real parent IDs remain
available for editors; virtual IDs never enter persisted relationships or editor
choices. Real rows retain their existing archive/unarchive constraints and
actions. Reordering uses the displayed real sibling set and excludes virtual
rows.

Group and footer balances and G/L include active and archived account leaves
exactly once, regardless of collapse or filtering in the grid. Virtual groups
use the same descendant aggregation and completeness rules as real groups.
Accounts retains balance/G/L columns. Legacy asset/liability and archive links
redirect to `tab=BALANCE&mode=active`. Both sides contribute once to the signed
footer total, and groups may contain accounts with either balance sign.

Income and expense categories remain unitless. Under Account Book Settings,
**Show Archived** defaults off and selects active-only tree data; enabling it
loads both states and uses the same virtual Archived hierarchy. Categories have
no balance/G/L columns or totals explanation. Legacy Income/Expense archive
links preserve the selected tab and enable archived visibility.

## Account List Loading Strategy

- Initial page load requests account tree data with
  `includeReferenceBalances: false` to avoid blocking first paint on external
  valuation lookups.
- The route then lazily hydrates `Balance (<referenceCurrency>)` in the
  background for non-equity tabs.

## Valuation Providers and Caches

- Reference-currency conversion and account/group reference-balance assembly are
  implemented in `src/server/accounts/accounts-queries.ts` (re-exported via
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

## Accumulated Holding Gain/Loss

Account-list native and reference-currency balances retain their signed booking
values for both assets and liabilities: positive means owned, negative means
owed. Group and footer balances sum these signed amounts; missing-conversion
rules remain unchanged. This presentation does not alter Report/History
classification, net worth, or the gain/loss calculations below.

The unified Accounts list displays Total, Realised, and Unrealised under
`G/L Since Start (<referenceCurrency>)`. These figures replay holdings from the
account-book start through today, using the existing opening valuation on the
day before book start as the basis for opening holdings. They include calculated
holding price/FX gains and losses, excluding separately booked explicit G/L and
income such as dividends and interest. Securities traded in the reference
currency are eligible; reference-currency cash is not.

The ledger decides whether to show G/L Since Start from the account metadata and
the book's actual reference currency before rendering or requesting G/L data.
Only Asset and Liability accounts are eligible, excluding reference-currency
cash. Ledger data always includes the book's reference currency, independently
of whether booking values need conversion for reference-currency columns.

The G/L column-group header contains its title and an info button. The button
opens calculation details with locale-formatted, labelled start and as-of dates
and the explanation of active/archived totals and incomplete data. Calculation
dates appear only in the popover, so the lazy summary request does not change
the header height or move account rows. Details remain accessible while loading,
with “Loading calculation dates…” before dates arrive and “Dates unavailable”
after failure. Failures retain the page's error message and retry action. An
open details popover updates in place when loading completes, retaining keyboard
focus.

The shared FIFO/execution-pricing engine supports chronological range replay.
Executions and transfers are ordered by booking date and booking ID. Each
transaction is decomposed into same-unit transfer quantities and remaining
executions. Opposite quantities in different Asset/Liability accounts are
matched by exact currency, cryptocurrency, or security symbol and trading
currency; fee, cash, income/expense, and explicit G/L bookings do not disqualify
a transfer. Matching maximizes the cross-account quantity and retains
source-to-destination routing, so an account that both sends and receives never
receives its own lots as its matched transfer. Matched quantities carry
acquisition costs between accounts. A split source booking transfers FIFO lots
before its execution remainder is consumed. Only residual quantities participate
in execution pricing and residual allocation. Fees retain their existing expense
treatment; this does not capitalize fees into transferred holdings. Source-first
multi-day transfers remove FIFO lots on each outgoing booking date and hold them
in a transfer-specific pool until receipt. Sales between those dates consume
only the source's remaining lots. On receipt, carried lots close any opposite
destination position using FIFO and each incoming lot's carried acquisition
cost. The destination records that realised G/L; any remainder keeps its
original cost and acquisition order. The calculation exposes one transfer-basis
event per receipt that closes lots, with per-match costs and no market-reference
amount. A fully closed position has no open lots and needs no closing valuation.
Same-date and receipt-before-withdrawal transfers retain their existing atomic
treatment. Calculation includes all real holding accounts, including archived
accounts and both account types; filtering to the selected tab happens
afterwards. The Accounts hierarchy and its totals include active and archived
accounts. Virtual transfer clearing is not included in real-account totals.
Group and footer amounts sum account leaves using Decimal arithmetic before
conversion to display numbers. Zero-balance and archived accounts retain
realised gains.

The Accounts list caches one book-wide summary dataset in Redis before filtering
by account type. Warm hits skip transaction loading, valuation lookups, and FIFO
replay. Ledger summaries and calculation drawers continue calculating
independently. This improves repeat loads; a cold cache still requires the
complete historical replay.

The cache uses the existing deployment namespace and database-owned
`AccountBook.periodCacheRevision`, plus the resolved UTC as-of day and latest
fetchable valuation day. Edits that advance the revision invalidate summaries
across processes; UTC rollover and the daily provider publication cutoff select
new keys. Entries expire after 24 hours and are limited to 512 KiB. Monetary
values use the shared exact Decimal codec. Book/user deletion and restore
cleanup include this cache family across all versions and environments.

Persistence follows History's valuation-source policy: every dependency must
come from identity conversion or a stable Redis TimeSeries hit covering the
requested day or publication-window cutoff. An older TimeSeries quote reached
after unsuccessful newer probes is a temporary fallback and does not qualify.
Provider, temporary fallback, and missing valuations are returned for the
request but not persisted. G/L cache v4 includes archived group metadata and
ignores earlier summary generations; the underlying valuation caches are
preserved. The snapshot revision must match the lookup revision and a final
committed-revision read, and the publication cutoff must remain unchanged during
calculation. Overlapping loads share an in-process promise scoped to the
complete cache key. Unavailable Redis or revision reads, malformed/oversized
cache entries, and Redis command failures fall back to the uncached calculation.
As with the other period caches, Redis requires `PERIOD_BASE_CACHE_ENV`.

G/L hydrates independently of the account tree and reference balances. A failed
request exposes a retry action. A missing closing price leaves reliable Realised
G/L available while Unrealised and Total remain unavailable; the drawer still
shows open-lot quantities and acquisition costs. Missing opening or execution
basis, including partially posted holding transactions, withholds accumulated
G/L and propagates through dependent transfers. Group/footer components remain
unavailable if any eligible descendant lacks that component.

An individual holding ledger displays the same three values since book start,
using the selected month/year end capped at today (today when unfiltered).
`View Calculation` loads a drawer with realised execution pricing, FIFO matches,
unrealised open lots, and completeness diagnostics. Summary and drawer use the
same range calculation. Report and History retain their existing period meaning;
accumulated realised/unrealised values are not sums of period splits. Opening an
event in the ledger closes the calculation drawer before navigating to the
transaction and clearing the ledger's period filter.

### Historical basis reuse

Accounts-list and ledger summaries share a Redis cache of complete historical
cost bases: realised G/L and remaining FIFO lots. Closing prices are resolved
separately, so a missing/temporary closing valuation or a new day does not
require historical replay when the effective bookings are unchanged. The
existing final-summary cache remains above this layer for Accounts-list hits.
Calculation drawers retain independent full replay and the same financial
semantics.

Basis cache v3 includes archived group metadata and ignores earlier cost bases.
Keys use the book revision and latest effective booking date. Changes to
bookings/settings or future bookings becoming effective force a rebuild. Only
complete bases from stable historical valuation sources persist; recent
non-identity execution prices cannot persist until their valuation dates pass
the publication cutoff. Cache failures fall back to full calculation. See
[Accumulated G/L historical basis cache](server-functions.md#accumulated-gl-historical-basis-cache)
for limits, snapshot validation, and cleanup behavior.

### Concurrent account G/L valuation

Accumulated account G/L overlaps independent valuation lookups with a limit of
four high-level lookups per calculation. Rate/date Promise memoization runs
before scheduling, so repeated rates share a lookup without occupying extra
slots. Opening balances, historical execution pricing, on-demand transfer
fallbacks, and closing valuations use the same request-local limit.

After opening holdings are initialized, required historical conversions are
prefetched before ordered execution pricing and FIFO replay. Transfers carrying
cost basis need no market prices; replay-dependent transfer fallbacks remain on
demand. All historical dependencies finish before a basis can be cached. Closing
prices for open positions are then prefetched separately, including on
basis-cache hits; closed and skipped holdings require no closing lookup.
Callbacks, diagnostics, and lot replay retain their order. Report and History
retain their existing lookup behavior.

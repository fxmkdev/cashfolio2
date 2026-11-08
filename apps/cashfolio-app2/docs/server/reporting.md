# Reporting

Scope: `apps/cashfolio-app2`; source paths are relative to that app.

[Server functions](../server-functions.md) ·
[Architecture and ownership](../architecture.md)

### Period Module Organization

Period implementation modules are grouped by concern under `src/server/period/`:

- `base-data/`: database-derived period inputs, loaders, queries, and types
- `cache/`: shared cache generation/key helpers, base-data cache, and History
  metrics cache
- `holdings/`: period adapters for real/synthetic holdings, batching, report
  contributions, and execution-residual attribution; reusable FIFO belongs to
  the independent `src/server/holdings/` domain
- `history/`: History loading, point metrics, scopes, and opening-balance points
- `reconciliation/`: gain/loss reconciliation and event-level explain data
- `breakdown/`: gain/loss breakdowns and contribution attribution
- `overview/`: Period overview loading, aggregation, responses, equity bookings,
  and cash flow
- `transfer-clearing/`: virtual transfer-clearing buckets, hierarchy, and
  gain/loss
- `net-worth/`: end-of-period and opening-balance net-worth loading

Within History, the server-function entry keeps authorization, request-local
read-budget initialization, revision validation, and response delivery. Batch
loading owns opening balances and the bounded point scheduler; response assembly
owns scope merging, scope selection, and numeric boundary mapping. Public
response types and existing facade exports remain stable. Point-metric loading
separately prepares base data, runs equity/valuation aggregation, and assembles
Decimal metrics and scopes. The shared valuation context, concurrency,
cacheability tracking, and rounding order are preserved across these boundaries.

Cross-concern selection, conversion, balance statistics, unit formatting, and
calculation-context preparation remain at the period folder root.
`period-calculation-context.ts` prepares the shared maps and virtual hierarchy
from preloaded base data, as described in the
[reporting data-loading boundary](#reporting-data-loading-boundary).
`period-helpers.ts` retains selection/year helpers and rounding, and re-exports
the extracted helpers:

- `breakdown/period-breakdown-state.ts`: group paths, accumulator types, and
  mutable hierarchy nodes shared by breakdown builders
- `breakdown/period-breakdown-buckets.ts` and `period-allocation-breakdown.ts`:
  bucket summaries and period-end allocation; `period-allocation-hierarchy.ts`
  builds the allocation grouping tree and formats its reporting metadata
- `breakdown/period-breakdown-hierarchy.ts` and
  `period-signed-breakdown-hierarchy.ts`: positive and signed hierarchy builders
  with their respective pruning/discrepancy rules

Reusable holding-event and eligibility helpers live in the independent holdings
domain and are imported directly from `holdings/events.ts`.

Extracted breakdown builders use the shared money rounding primitive directly;
they do not import back through `period-helpers.ts`. Breakdown and holding-event
helpers remain pure and consume prepared inputs; database reads stay in the
base-data loaders. Tests live alongside the modules they exercise; cross-concern
pipeline tests remain at the root. Use explicit imports between these modules.
Existing public facades in `src/server/` remain the entry points for routes and
keep their import paths stable.

## Period Overview Gain/Loss

Explicit Gain/Loss bookings record statement value adjustments for manually
valued accounts, such as managed or discretionary portfolios. Contributions and
withdrawals remain transfers; automatically valued holdings use calculated
holding results. See
[Explicit Gain/Loss for manually valued accounts](../ui/accounts-and-classification.md#explicit-gainloss-for-manually-valued-accounts)
for the workflow, adjustment formula, and booking signs.

The canonical period gain/loss semantics are shared between:

- `getPeriodOverview` (`src/server/period.ts`)
- history metrics loading
  (`src/server/period/history/period-history-point-metrics.server.ts`)

Both loaders reuse the shared period base-data cache and shared gain/loss
subflows while keeping their output work focused:

- period overview computes the full response payload
- history metrics compute only scalar series values

The engine keeps period gains/losses aligned with net-worth deltas by using a
single tracked-account flow:

- Tracked accounts include:
  - non-reference real holding accounts
  - non-reference virtual transfer-clearing holding accounts
- Both real transactions and synthetic transfer-clearing transactions flow
  through the same lot/FIFO pipeline in `src/server/holdings/engine.server.ts`
- Each transaction is decomposed by holding identity into maximum cross-account
  transfer quantities and residual executions, regardless of additional fee or
  other bookings. Transfers carry FIFO cost and acquisition order; residual
  quantities alone participate in execution pricing. At a split booking,
  transfer movement precedes its execution remainder. All calculation paths
  replay in booking-date/ID order. Real-account reconciliation loads sibling
  holdings and their period transactions to reconstruct the same transfer basis
  as summaries.
- Same-unit mixed-period holding transfers are treated as non-realizing carry
  adjustments, so in-period legs no longer create false realization when the
  opposite leg sits outside the selected period. Carry legs replay on their own
  booking dates, before any execution remainder of the same booking, so an
  intervening execution sees the updated FIFO position. Each carry group keeps
  its conversion completeness check and opening unit basis across dated batches.
- Explicit gain/loss remains separate from holdings realization:
  - `stats.explicitGainLoss` includes explicit equity G/L bookings only
  - `stats.realizedGainLoss` includes holdings realization and residual-only
    execution reconciliation
  - `stats.gainsLosses = explicit + realized + unrealized`

Execution-residual reconciliation for eligible multi-unit income/expense
transactions is isolated in
`src/server/period/holdings/period-execution-residuals.ts`:

- Candidate transactions are narrowed at query level to completed (no
  post-period legs) multi-unit transactions with at least one in-period booking
  and at least one income/expense leg, while excluding explicit/opening balance
  cases
- Residual realization uses the same transfer decomposition and is skipped
  unless all required conversions succeed and no residual in-period tracked
  holding booking exists. Fully transferred holding legs cannot suppress
  unrelated execution residuals or receive their attribution
- Residual breakdown attribution is weighted across non-reference legs by
  absolute converted amount

Transfer-clearing candidate loading now includes income/expense equity legs in
addition to asset/liability legs. This keeps net-worth timing aligned when
cross-period income/expense transactions remain partially posted at period end.

To keep `src/server/period.ts` as a stable facade, the larger gain/loss subflows
are split into dedicated modules under `src/server/period/`:

- `src/server/period/overview/period-equity-bookings.ts` handles paged equity
  booking conversion from preloaded period base data, equity aggregation, and
  explicit counterpart attribution
- `src/server/period/holdings/period-holding-gain-loss.server.ts` handles
  tracked holding lot/FIFO orchestration (real + transfer-clearing synthetic
  transactions) and residual realization integration

## Asset-Class Gain/Loss Reporting

Period overview and History share the contribution pipeline and support Account
Structure and `Asset Class → Subclass → Investment Group → Account` breakdowns.
Overview returns `accountBreakdownsByGrouping`, keyed by `accountStructure` and
`assetClass`, with `assetBreakdown`, `liabilityBreakdown`, and
`gainsLossesBreakdown` per lens. Both variants reuse one valuation pass. G/L
breakdowns carry aggregate realized, unrealized, and total amounts, computed
from exact contributions before rounding. Current account classification applies
to every period, including archived assets and liabilities. Unit and instrument
identity continue to control valuation and FIFO independently of classification.

Each class lists its ordered subclasses first, then investment groups for
accounts assigned directly to that class. Unclassified uses the same investment
grouping. Descendant accounts contribute to each ancestor total exactly once.
Stable class and investment-group IDs survive class rename and reparent
operations.

Investment groups use currency codes, cryptocurrency codes, or security symbols
across trade currencies. Accounts marked `TOTAL_PORTFOLIO_VALUE` group under
Total Value Accounts, keeping recorded performance and calculated FX together.
Account identity metadata determines grouping, so an adjustment booking's
currency cannot move an investment to a different unit. Synthetic accounts use
their clearing-bucket or unique contribution unit, otherwise Unknown Unit.

Calculated holdings G/L uses the owning account's classification. Recorded
Gain/Loss equity bookings use their resolved asset/liability counterpart.
Calculated and recorded amounts are combined once per account, with their
provenance retained in account-node metadata. Reference-currency accounts have
no calculated FX contribution, but their recorded adjustments remain included.
Null classification is Unclassified, distinct from Other Assets.

Account Structure places real G/L accounts under their current nested groups.
Transfer Clearing retains its virtual hierarchy, including G/L contributors
whose closing clearing balance is zero. Contributions without an identifiable
financial account/group appear in a virtual Unattributed group. Offsetting
contributions remain visible even when a group's net G/L is zero.

History G/L options carry `grouping` metadata. Account Structure uses
`group:<id>` and `account:<id>`; Asset Class retains `asset-class:<class>` and
`gain-loss-account:<id>`, with `gain-loss-investment:<class>:<unit>`
intermediate scopes. Both leaves carry account metadata for reconciliation. The
grouping headings exist only in the client selector. Scopes are unioned across
periods; an absent contribution at a point evaluates to zero. History metrics
cache v14 includes both grouping lenses and investment scopes; base-data v12
includes tracking methods and the classification tree. Valuation cache versions
remain compatible.

Execution residual amounts retain their existing allocation weights. Only
contributing residual portions carry originating-account metadata; fully
transferred legs and skipped candidates cannot affect classification. Real
accounts use their own class; equity-origin residuals inherit a class only when
one originating financial account is identifiable. Transfer-clearing FIFO stays
pooled by unit. Its reporting class comes from a single identifiable originating
account; multiple or missing origins remain Unclassified with an explanation.
Legacy missing/multiple-counterpart amounts also remain visible there.

All aggregation uses Decimal before the existing two-decimal response rounding.
Independently rounded rows can differ from a rounded aggregate by a cent; no
synthetic balancing contribution is added. The underlying total G/L, balances,
net-worth reconciliation, and income/expense calculations are unchanged.

The breakdown's realised component continues to include recorded adjustments;
where displayed together it is labelled Realised / Recorded. A recorded manual
adjustment does not establish economic realisation. Aggregate
`stats.realizedGainLoss` still means calculated holdings/residual realisation,
with `stats.explicitGainLoss` separate. A broader realisation model is outside
this reporting change.

The account reconciliation page replays the shared contribution pipeline and
shows the combined total, calculated FIFO explanations, recorded adjustments,
and execution residual rows with transaction links. Reference-currency and
legacy unattributed accounts are supported. Recorded-adjustment links open the
complete transaction in Transactions for the reconciliation period. Its G/L
booking ensures inclusion even when the financial-account booking falls in a
different month or year. Calculated-event and execution-residual links retain
the real account's ledger and period, or Transactions for virtual accounts.

Base-data v12 includes account tracking methods alongside originating-account
IDs and recorded booking descriptions. History metrics v15 carries both grouping
lenses, investment scopes, and explicit account metadata; older hierarchy
payloads are not reused. Classification and tracking-method edits advance

`AccountBook.periodCacheRevision` transactionally, invalidating both cache
families for all periods. No changes to provider caches or FIFO keys are needed.

## Gain/Loss Reconciliation Explain Fields

`getPeriodGainLossReconciliation` now includes event-level explain data for
`realizedEvents`:

- `lotMatches[]`: consumed-lot attribution for each realised event
  (`acquisitionSortKey/date/source`, matched quantity, lot cost, execution
  price, per-lot delta, running event realised).
- `pricing`: pricing-source metadata (`directConversion`, `residualAdjusted`,
  `marketFallback`) plus market/residual/effective reference amounts.
- `rounding`: raw vs rounded event values used by the reconciliation UI
  explanation drawer.

## Period Warning Surface

When `skippedBookingsCount > 0`, the report page shows a partial-data warning
below the period selector. This warning explicitly states strict
`totalReturn == netWorth delta` checks may be incomplete for the selected period
due to unavailable valuation data.

The report page also shows a net-worth reconciliation warning when
`endOfPeriodNetWorth` does not match `baselineNetWorth + totalReturn` at cent
precision. The baseline uses the previous period's end net worth when available,
and falls back to opening-balance net worth derived from balances strictly
before the current period start.

## Reporting data-loading boundary

Period overview and History calculations consume complete database-derived
inputs from `PeriodBaseData`. The base-data loader owns paginated transaction
queries, opening holdings balances, and explicit gain/loss counterpart account
resolution. Execution-residual candidate transactions include all booking legs,
including legs before the selected period; candidate selection retains the
income/expense, completion-period, and explicit/opening-balance exclusions.
Periods before the account-book start contain no residual candidates.

Holding and execution-residual calculation helpers require preloaded inputs and
have no Prisma dependency or fallback queries. They keep valuation resolution
injected through callbacks. `preparePeriodCalculationContext` builds the common
real/virtual account hierarchy, balance maps, account names, and
transfer-clearing holding accounts without modifying cached data. Overview and
History retain their own response assembly, scheduling, and History
valuation-cacheability tracking.

Base-data v8 adds required `executionResidualTransactions` and does not reuse v7
entries. The existing Decimal/date codec, 24-hour TTL, 2 MiB size limit, and
database revision invalidation apply to these raw inputs. Converted residual
results remain outside the base-data cache. History metrics use a separately
versioned cache; v8 excludes results from before partial-transfer recognition
and retains the stable-valuation policy introduced in v7. No schema migration is
required. This boundary removes live database queries during calculations. Each
uncached period dataset is loaded in one read-only PostgreSQL `RepeatableRead`
transaction with a 30-second timeout. Account-book settings, cache revision,
account metadata, balances, all paginated booking/transaction queries, transfer
clearing, and explicit counterpart resolution use that same transaction client.
Transaction failures propagate rather than falling back to independent reads.
Calculations, valuation/provider requests, and Redis I/O run after the
transaction finishes.

Transaction candidate queries resolve income/expense, opening-balance, and
explicit gain/loss account IDs from metadata read in that same snapshot. Their
booking predicates filter these IDs directly instead of joining account
classification for each candidate. This avoids repeated whole-book scans when
PostgreSQL statistics predate a newly imported or seeded book, which can
otherwise exhaust the snapshot timeout during cold yearly History loading.
Opening-balance accounts remain excluded from period equity bookings.

The snapshot loader returns its revision as internal metadata; public responses
and cached payloads are unchanged. A base-cache miss is persisted only when the
snapshot revision matches the lookup revision. Derived History metrics also
recheck the revision after calculation and skip persistence if it changed or
cannot be read. An overlapping mutation can therefore return a coherent older
snapshot without contaminating a newer cache generation.

Gain/loss reconciliation loads the same `PeriodBaseData` snapshot once and uses
it for both contribution totals and real/virtual account explanation rows. Book
settings, resolved period bounds, account identities, opening holdings,
transactions, and transfer-clearing buckets all come from that snapshot. The
explanation builders do not query Prisma or reload transfer-clearing data during
valuation. A concurrent edit may leave the response on the older committed
snapshot, but cannot mix its totals with newer explanation inputs. Labels are
formatted for the requested locale from the snapshot's resolved month/year.

This snapshot guarantee applies to each period overview or History point
independently. History does not hold one database transaction across all points
or external valuation requests. Its batch endpoint checks the book revision
before returning a response, and the client loader rejects batches with a
different revision before merging them. Concurrent edits stop loading with an
explicit retry action rather than publishing a mixed-revision History chart.
Retry starts the complete load again; it does not reuse incomplete batches.

### Balance-based Asset and Liability Reporting

Report and History classify each balance account by its exact reference-currency
balance at the reporting date, before rounding or grouping. Positive balances
contribute to Assets; absolute values of negative balances contribute to
Liabilities. Zero balances contribute to neither. The stored `BALANCE` type
determines eligibility; equity accounts are excluded. Virtual transfer-clearing
accounts follow the same rule. Net worth remains Assets minus Liabilities and is
unchanged by this classification.

Allocation charts and tables support either the original account/group hierarchy
or hierarchical Asset Class → Subclass → Investment Group → Account grouping on
each side, even when a structural group's accounts have mixed signs.
Classification by balance sign precedes either grouping; total amounts use the
same exact balances. Unavailable valuations are omitted; both allocation views
report the same overall missing-balance count. Amounts on the liability side are
positive debt magnitudes. Existing allocation rounding and hidden-small-balance
discrepancy indicators remain applicable.

Allocation reuses G/L investment descriptors from account attribution: currency
and cryptocurrency codes, security symbols across trade currencies, and Total
Value Accounts for Total Value tracking. Investment IDs are
`allocation-investment:<classId>:<groupKey>`; class/account IDs stay stable.
Discrepancy metadata includes affected investment groups and class ancestors.
Report Asset Class account leaves include optional `accountGroupPath` metadata
in root-to-parent order, resolved from the current financial account hierarchy.
Names and navigation IDs remain separate from these display paths. Synthetic G/L
entries retain their source labels.

History applies classification independently at every month/year endpoint and
its opening baseline. Assets and Liabilities expose aggregate totals only. Net
Worth supports account/group scopes using signed reference-currency balances,
including the opening baseline; group scopes sum all descendant accounts before
rounding. The complete real Balance Account hierarchy is loaded once per
request, including archived accounts, zero balances, and empty Balance Account
groups. Virtual transfer-clearing scopes are merged across period points.
Unavailable valuations remain omitted from amounts without removing real scope
options. History metrics v15 includes Net Worth scopes, both Gain/Loss grouping
lenses, and investment groups; base-data v12 includes tracking methods.
Valuation caches remain compatible.

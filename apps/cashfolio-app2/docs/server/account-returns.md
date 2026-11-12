# Account Returns

Scope: `apps/cashfolio-app2`; source paths are relative to that app.

[Server functions](../server-functions.md) ·
[Architecture and ownership](../architecture.md)

## Account returns

`getAccountReturnSummaries` accepts an account-book ID, `accountState`
(`active`, `inactive`, or `all`), and `grouping` (`accountStructure` or
`assetClass`). It returns cumulative/annualized TWR and MWR, effective
investment dates, and metric-specific diagnostics for account leaves, displayed
group IDs, and the footer. Group returns use all descendant balances, including
cash.

`getAccountReturnDetails` accepts the same scope plus `target`: an account or
group with an `id`, or `{ kind: "total" }`. Individual targets optionally accept
the ledger's `period`. `includeDetails` defaults to false; true includes dated
valuation/TWR-factor and capital-movement tables with transaction references.
Both functions authorize book access on every request before starting their
bounded read. Responses are
`{ status: "pending", continuation, progress, retryAfterMs }`,
`{ status: "restart" }`, or `{ status: "complete", data }`. The complete data
shape is unchanged. Pending progress includes an immutable context hash,
verified revision, work ID, monotonic sequence, phase, target counts, dates,
completed displayed rows, and an optional completed footer. Callers merge
completed rows by displayed ID and keep dots only on pending rows. They reject
aborted or older responses, clear progress synchronously on scope or revision
changes, and preserve completed rows during a retry in the same context. The
grid explicitly refreshes return cells on progress/loading transitions,
including null-to-null transitions. Optional `batchSize` remains 1–128 for
transport compatibility; historical batches perform at most four provider tasks
and calculation batches at most four distinct memberships or ten seconds.

Continuations bind verified user, book revision, sorted membership/scope,
target, period, detail option, reporting day, and publication cutoff. An index
lets reloads and concurrent tabs reuse active/completed work. A 65-second Redis
lease serializes advancement within the existing 60-second read deadline. Atomic
`LPUSH`/`LINDEX` ordering and token-specific `LREM` release use the production
read/write-only ACL; Lua/transactions are not required. Expired abandoned tokens
are removed by identity, so an old owner cannot release a newer owner. A bounded
local lease/checkpoint fallback works without Redis. Missing, expired, or
mismatched work requests a restart; repeated invalidations restart at most
twice. Every request authorizes book access again. Account details load relevant
transactions with their complete peers.

`account:returns-work:v4` stores small mutable envelopes (256 KiB limit), with a
15-minute lifetime. Separate immutable artifacts hold a coherent transaction
basis, canonical membership plans, and individual scope results (8 MiB each).
Account indexes retain complete transaction peers. Distinct memberships
calculate once and attach all displayed IDs/names; both grouping modes share
matching results. Process-local artifacts are bounded to 64 MiB/4096 entries and
15 minutes, checkpoints to 16 entries, and work indexes to 64. Redis artifacts
last at most 24 hours. These keys participate in existing book/user deletion and
restore cleanup. Each batch rechecks revision, reporting day, and cutoff before
publishing.

The shared historical-series loader reads each raw Redis series/window plus its
predecessor once per batch, resolves dates in memory, and shares FX dependencies
across all conversions. Provider requests use supported paginated ranges or
grouped per-date fallback on explicit subscription restrictions. Provider/auth/
quota/transient failures do not prove historical gaps. See
[historical series caching](../valuation-caching.md#historical-series-loading-for-account-returns).

Implementations live under `src/server/accounts/returns/`. Return summaries use
`account:returns:v4` with revision, date, cutoff, grouping, and account-state
keys. Stable complete results retain the 24-hour TTL. Complete results with
temporary dependencies expire no later than their earliest dependency or the
work's 15-minute lifetime; reads never extend validity. Missing-price results
and request failures cannot enter the successful summary cache. Cache failures
fall back to calculation, while resource errors propagate. Balances and G/L
remain usable independently.

See
[return calculation behavior](../valuation-reference-balances.md#time-weighted-and-money-weighted-returns)
for timing, attribution, in-transit balances, unavailable values, and
annualization.

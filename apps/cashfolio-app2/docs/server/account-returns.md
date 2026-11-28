# Account Returns

Scope: `apps/cashfolio-app2`; source paths are relative to that app.

[Server functions](../server-functions.md) ·
[Architecture and ownership](../architecture.md)

## Account returns

`getAccountReturnSummaries` accepts an account-book ID, `accountState`
(`active`, `inactive`, or `all`), and `grouping` (`accountStructure` or
`assetClass`). It returns cumulative/annualized money-weighted Return, effective
investment dates, and diagnostics for account leaves, displayed group IDs, and
the footer. Group returns use all descendant balances, including cash.

`getAccountReturnDetails` accepts the same scope plus `target`: an account or
group with an `id`, or `{ kind: "total" }`. Individual targets optionally accept
the ledger's `period`. `includeDetails` defaults to false; true includes dated
valuation snapshots and capital-movement tables with transaction references.
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

Historical plans include pre-book-start conversions consumed while normalizing
those complete peers, such as a foreign-currency payment before book start for a
security received afterwards. Dependency dates and displayed capital-movement
dates have different bounds: reporting dates and in-range movement filtering
remain unchanged. Future dates remain excluded from the capital dependency plan.
Planning runs normalization with a recording rate resolver and records scope
valuations through the same resolver. Only consumed conversions are planned; an
unused pre-start transfer date cannot trigger a provider probe.

`account:returns-work:v7` stores small mutable envelopes (256 KiB limit), with a
15-minute lifetime. Separate immutable artifacts hold a coherent transaction
basis, canonical membership plans, and individual scope results. Each artifact
uses a versioned manifest and immutable, generation-specific chunks of at most 1
MiB in UTF-8. A bounded record stream preserves Decimal values, UTC dates,
ordering, and complete transaction peers without encoding or joining a second
whole-book JSON string. Large individual strings can span records as well.
Manifests publish only after all chunks are written; readers verify chunk
hashes, lengths, expiry, stream completeness, and the domain payload. Corrupt,
missing, or partially written snapshots are cache misses. Chunks and manifests
share an absolute expiry through ordinary `SET PXAT`, compatible with the
existing ACL. Account indexes retain complete transaction peers. Distinct
memberships calculate once and attach all displayed IDs/names; both grouping
modes share matching results. Plan/result artifact IDs use
`plan-v5`/`result-v4`, and the transaction basis uses `basis-v2`. Versioned
calculation contexts restart incompatible old continuations, including locally
retained work. The plan version is included in calculation contexts, so updates
to dependency planning restart earlier continuations. Transaction bases and
valid completed results remain reusable. Process-local artifacts are bounded to
64 MiB of encoded data, 4096 entries, and 15 minutes; eviction removes complete
logical artifacts. Larger artifacts bypass local retention and remain usable
within their request. When a basis is unavailable, the next batch reloads its
coherent inputs at the verified revision while retaining the existing plan and
checkpoint. Fresh inputs pass directly to that batch, avoiding cache-size
restart loops without Redis. Database reads use pages of 1,000 transactions
within the existing 30-second read-only snapshot transaction; request deadlines
remain unchanged. Account, position-change, and capital-date indexes avoid
repeated full-array scans. Checkpoints remain bounded to 16 entries, and work
indexes to 64. Redis artifacts last at most 24 hours. These keys participate in
existing book/user deletion and restore cleanup. Each batch rechecks revision,
reporting day, and cutoff before publishing.

The shared historical-series loader reads each raw Redis series/window plus its
predecessor once per batch, resolves dates in memory, and shares FX dependencies
across all conversions. Provider requests use supported paginated ranges or
grouped per-date fallback on explicit subscription restrictions. Provider/auth/
quota/transient failures do not prove historical gaps. See
[historical series caching](../valuation-caching.md#historical-series-loading-for-account-returns).

Result contracts retain `mwr` and `annualizedMwr` as internal method names; no
time-weighted fields or diagnostic method selectors are returned. Detail
valuations are deduplicated `{ id, date, kind, value }` snapshots with opening,
intermediate, or closing purposes; capital movements retain transaction
references. Cache validators reject legacy method/interval payloads. Summary and
planning calls do not build detail tables. Raw historical-series and coverage
caches are unchanged, and all return-cache versions remain covered by
deletion/restore cleanup.

Implementations live under `src/server/accounts/returns/`. Return summaries use
`account:returns:v6` with revision, date, cutoff, grouping, and account-state
keys. Stable complete results retain the 24-hour TTL. Complete results with
temporary dependencies expire no later than their earliest dependency or the
work's 15-minute lifetime; reads never extend validity. Missing-price results
and request failures cannot enter the successful summary cache. Cache failures
fall back to calculation, while resource errors propagate. Balances and G/L
remain usable independently. Initial cache-only probes use a separate read path
from deduplicated cache-populating jobs, so a simultaneous reload cannot replace
a finishing calculation's loader with a cache-miss result.

### Internal orchestration

The query coordinator keeps lease acquisition, the post-acquisition checkpoint
reread, error invalidation, and release in one visible control flow. Context and
continuation validation live in `return-work-context.server.ts`; bounded scope
execution lives in `return-work-batch.server.ts`; checkpoint updates and
response assembly live in `return-work-response.server.ts`. Both calculation
passes share one counter and timer, and ready or recovered results publish
before provider work. Internal work contracts live in the type-only
`return-work-types.ts`.

Both RPC handlers log unexpected failures inside the handler, before RPC error
serialization. Logs retain the original error message, stack, code, and cause,
with operation, book ID, grouping, account state, target kind, and a boolean
continuation indicator. They omit financial payloads and request credentials.
Cache failure diagnostics include the artifact ID, encoded bytes, chunk count,
and chunk limit; malformed JSON errors omit payload previews. Expected
authorization redirects and request cancellations do not produce error logs.
Cleanup failures are logged separately and cannot replace the original
calculation error. Existing successful summary caches remain on version 6.

Synthetic regression coverage includes 100,000 transactions exceeding the 64 MiB
local retention budget, with summaries, both grouping modes, totals, and detail
tables using deterministic cached rates. A database-backed scale test in the
mutation integration suite verifies real pagination and chunk encoding against a
disposable PostgreSQL database; it performs no provider calls.

Transaction normalization remains ordered: collect position changes, handle
recorded G/L adjustments exclusively, then decompose transfers and price
residual executions. Dedicated adjustment, transfer, and execution helpers
receive the same accumulator and conversion callbacks. Internal transaction
contracts live in the type-only `return-transaction-types.ts`. These boundaries
preserve movement identities, Decimal operation order, diagnostics, and
settlement bridges; they do not introduce new persisted schemas or cache
versions.

See
[return calculation behavior](../valuation-reference-balances.md#money-weighted-return)
for timing, attribution, in-transit balances, unavailable values, and
annualization.

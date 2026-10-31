# Request and workload limits

Cashfolio bounds individual inputs and valuation work within each incoming
request. These safeguards suit the current restricted-access application and
supplement authorization and same-origin checks; they are not an edge-level or
volumetric DDoS defense.

## Input boundaries

The custom server entry point reads at most 5 MiB before handing a request to
TanStack Start for deserialization. It measures actual bytes, including requests
without a trustworthy `Content-Length`, cancels overflow with `413`, and limits
body reading to ten seconds (`408` on timeout/disconnect). The statement
importer checks file size before reading a CSV. Browser validation is advisory;
server contracts independently enforce the limits.

Browser-safe defaults live in `src/shared/resource-limits.ts`:

| Input                            | Maximum                     |
| -------------------------------- | --------------------------- |
| Transactions in one import       | 1,000                       |
| Total bookings in one import     | 5,000                       |
| Bookings in one transaction      | 100                         |
| Submitted IDs or reorder entries | 1,000, before deduplication |
| Description                      | 4,000 characters            |
| Name                             | 255 characters              |
| Identifier                       | 128 characters              |
| Currency/instrument code         | 64 characters               |

An import remains one account-book transaction. Oversized imports are rejected
before business writes; users must split them explicitly. The app never
automatically retries mutations or silently truncates input. Stored data is not
rewritten; newly submitted writes must meet the limits.

Both simple and split transaction editors validate description lengths before
submission and retain the draft when validation fails.

## Request-local calculation budgets

Each incoming request can initiate at most 250 provider HTTP attempts, including
retries and backtracking. Cache hits and joining an existing in-flight lookup do
not consume another attempt. Settled provider probes are reused within the
request, including without Redis; rejected probes are evicted. The memo and
attempt count are discarded when the request ends.

Expensive reads start a 60-second cooperative deadline after authorization.
Internal helpers share that deadline rather than extending it. Calculation units
and provider attempts check the budget; provider fetches and retry delays
receive its abort signal. Existing per-provider ten-second timeouts, bounded
Marketstack retries, backtracking, caching, and deduplication remain in place.
Redis connect/command timeouts remain one second with cache fallback.

A provider-attempt limit returns `429`; an expired read deadline returns `503`.
Responses carry `X-Cashfolio-Resource-Limit` and `Retry-After`, so clients do
not classify errors by message wording. Budget errors propagate through
valuation fallbacks rather than becoming successful partial calculations or
cached missing-price results. Logs include the error category and status,
without financial payloads or secrets.

The request context contains only cancellation, a deadline, an attempt counter,
a bounded memo, and closed-state checks. Completion, failure, or disconnect
closes and aborts it idempotently, preserving the original failure and
preventing later provider attempts by delayed siblings. Response-stream
completion/failure also closes the context. Calculation workers stop dequeuing
after a failure and wait for already-started workers before propagating it.

There are no per-user rates, concurrency leases, shared provider quotas,
database admission calls, or Prisma query interception. Ordinary database and
accounting operations do not depend on an admission store. Mutations are never
retried automatically.

## History loading

History loads the complete dataset through sequential client-side batches,
starting with 12 months or 5 years. It publishes the chart only after reaching
the book's beginning with its opening balance and a consistent revision. The
internal API retains its exclusive `before` cursor and integer `pageSize`
maximums of 120 months or 100 years. Opening balances are calculated only in the
earliest batch; earlier responses have `openingBalancePoint: null`. No
business-date cutoff or public pagination setting is introduced.

A request-level provider-attempt or read-deadline failure halves the batch size,
rounded down to at least one, and retries the same cursor in a fresh request.
The smaller size applies to the rest of that load. Failed batches contribute
nothing. If one period still exceeds a budget, loading stops with an error.
Network, unknown, and revision errors also stop immediately. There is no quota
waiting, backoff, checkpoint persistence, or automatic revision restart.

**Retry History** starts the entire load again with the default batch size.
Incomplete batches are discarded on failure. Scope options are merged before
normalization; a changed calculation scope is reloaded before publication.
Changing book/mode/scope/locale, invalidating the router, or leaving History
cancels the old load, and obsolete results cannot update the chart.

The shared global top progress bar covers loading, adaptive retries, and scope
normalization; there is no History-specific spinner or status text. An existing
complete chart remains visible with its previous scope and disabled selection
controls during active refreshes. Errors stop the bar and re-enable the mode and
View selectors while retaining the previous chart and its labels. **Retry
History** retries the failed selection from the beginning. When that selection
differs from the last successful one, **Restore Previous View** restores its
mode, metric, and scopes through normal navigation and a fresh load. It does not
reuse partial batches or bypass revision checks. Same-selection failures do not
show a redundant restore action. The original All/range buttons, navigator,
scopes, rolling averages, cumulative calculations, opening balance, and
drill-downs are preserved.

## Deployment and tuning

This PR adds no database migration, new service, or secret. Main's
account-tracking schema migration still runs through the normal deployment
process. The earlier unmerged workload migration and schema additions have been
removed. Preview-only workload tables created by an earlier revision may remain
unused; deployment does not delete them or business data.

Defaults live in `src/shared/resource-limits.ts`, with History batch defaults in
`src/shared/history-window-policy.ts`. Adjust them through reviewed changes with
boundary tests. Observe request errors and existing provider-usage reporting
before raising budgets, and check provider subscription capacity.

The deadline is cooperative: it cannot forcibly cancel an already-running
database query or preempt synchronous CPU work. Budgets apply per incoming
request, not across users or instances, and do not cap aggregate provider
subscription spending. Revisit shared admission if access becomes public or
observed usage makes it necessary.

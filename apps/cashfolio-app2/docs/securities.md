# Securities Discovery

The authenticated **Securities** page at `/$accountBookId/securities` searches a
shared Marketstack reference catalogue. The account-book parent route authorizes
book access; the reference data has no book, user or financial-account
associations. Each RPC independently requires an active authenticated user.
Discovery and **Copy Symbol** do not change account creation or valuation.

## Ownership and browsing

- `src/shared/securities/` owns transport contracts and exchange/availability
  labels. `src/server/securities.ts` is the public RPC facade; its private
  domain owns runtime validation, PostgreSQL queries and Marketstack history.
- `src/components/security-search/` owns the view and cancellable controller.
  The route's private page supplies real services. AG Grid's server-side row
  model uses 20-row blocks/pages. Query text, exchange, filters, sort order,
  counts and filter choices are evaluated over the full submitted search in
  PostgreSQL. Grid queries use POST to accommodate large set-filter selections
  without exceeding URL limits; they do not mutate reference data.
- Search submission pins a catalogue version and resets selection, filters and
  pagination. Sorting, filtering and page changes retain the selected listing.
  Desktop details scroll independently; below `64em`, the mounted grid is hidden
  while details are shown. Back/close restores focus and browsing state.
- Requests carry abort signals. Search replacement and route unmount cancel
  outstanding work; a replaced history response cannot update another listing.
  The grid also ignores obsolete count/error responses.

Open **Routes/Securities** in Storybook
(`pnpm --filter cashfolio-app2 storybook`). The interactive stories emulate the
server-side datasource with deterministic, illustrative listings/prices and
fixed fixture dates. They never call the server or Marketstack. Exercise
submit-only search, exchange/country/availability set filters, Name/Symbol text
filters, pagination, selection, range controls and copy feedback. Controller
stories cover unavailable catalogues, retry and late responses. The illustrative
fixtures make no provider-coverage or currency claims.

## Catalogue refresh and consistency

`SecurityCatalogueSnapshot` and `SecurityCatalogueListing` store reference data.
A listing is unique within a snapshot by the exact provider symbol and MIC;
internal row IDs are resolved against the requested snapshot before history is
loaded. An empty MIC is stored for unknown exchanges and returned as `null`.
Missing availability stays unknown, rather than becoming a confirmed absence.
Marketstack also supplies vendor exchange identifiers such as `XETRA` and
`NMFQS`; these are preserved exactly rather than truncated to four-character ISO
MICs. Symbols such as `NEE 6.219` retain internal spaces in storage, copying and
provider requests. Country placeholders such as `INDX` remain Unknown.

The standalone TypeScript worker (`src/securities-refresh/cli.server.ts`) first
checks one AAPL/XNAS catalogue result and a recent unadjusted EOD close. It then
loads exchange metadata once and reads every `/v2/tickerslist` page, enriching
missing countries from provider exchange country/country-code fields. Country
codes remain provider metadata; currency is never inferred from geography. It
does not load company profiles or prices for all listings.

The provider boundary follows the
[Marketstack v2 specification](https://docs.apilayer.com/marketstack/docs/marketstack-api-v2-v-2-0-0).

A transaction-scoped PostgreSQL advisory lock prevents concurrent bulk
refreshes. The worker reserves connections for the lock, staged batch writes and
best-effort provider-attempt logging. At most two page requests run concurrently
while batches are written in provider order. A changed page size or offset fails
validation rather than skipping or duplicating rows. Batch inserts use a bound
JSON parameter and PostgreSQL record expansion to avoid thousands of individual
bind parameters. Identical normalized listings with the same exact symbol/MIC
are stored once and counted separately; this handles repeated IEX records in the
provider catalogue. Conflicting metadata for one identity, offset/count/total
changes, malformed rows and incomplete/empty catalogues fail the refresh. The
only excluded provider records are explicitly identified `TEST`-exchange
placeholders with both symbol and name absent. Their count is logged, and raw
provider-row offsets still advance across every page. Missing identities on
other exchanges remain errors, and a catalogue containing only placeholders is
rejected. Only a completely staged catalogue is atomically published. Failed
stages are deleted; the previous active snapshot continues serving. Superseded
snapshots remain readable for 48 hours after their replacement, then become
unavailable and are removed on a later successful refresh. Clients with expired
versions receive a search-again error. Abandoned stages older than 24 hours are
removed during publication.

Status includes publication time and a stale flag after 48 hours. An environment
without a published snapshot shows catalogue-unavailable feedback with retry.
Refresh failures never appear as a successful empty search. A stale catalogue
remains usable while administrators investigate the refresh job.

## Selected-listing history

The history operation resolves the stored symbol and MIC, then requests all
paginated `/v2/eod` rows over the previous five years through the current UTC
accounting day. It validates exact exchange/symbol matching, pagination, dates,
unadjusted closes and duplicate days, sorts chronologically, and rejects mixed
quote currencies/units. Currency and security type come only from matching EOD
metadata. Missing metadata remains Unknown. Rows without a MIC are copyable but
cannot safely request history. A confirmed `has_eod: false` skips retrieval;
unknown availability still attempts it.

Successful nonempty history is cached in Redis for 24 hours under
`securities:marketstack:history:v1:` using symbol, MIC, requested window and UTC
through-day. The namespace and payload are separate from valuation caches. A
Redis failure or invalid payload falls back to bounded live retrieval. Errors
and empty histories are not cached. Range controls filter the loaded series
locally without additional provider calls.

Provider requests reuse `MARKETSTACK_API_KEY`, timeout/rate-limit retry
constants, resource-budget accounting and sanitized provider usage. A timed-out
request, network failure, unreadable HTTP payload or HTTP 5xx response retries
the same page at most twice, with bounded delays inside the existing deadline.
Cancellation and structurally invalid provider data never retry. Every HTTP
attempt is reported with `CATALOGUE_REFRESH`, `SECURITY_HISTORY` or
`RATE_LIMIT_RETRY`. Configuration, subscription/quota, malformed data and
transient errors have separate safe messages. Existing financial-account
valuation is unchanged.

## Operations

The refresh payload is bundled into the deployed app image. The GitHub workflow
[refresh-securities.yml](../../../.github/workflows/refresh-securities.yml)
creates an isolated Fly Machine from that environment's deployed web image,
checks its exit and completion metrics, then destroys it. It runs daily in
production at **04:17 UTC**. Subsequent full refreshes in staging and preview
use manual dispatch. A 30-minute worker deadline and a 32-minute runner deadline
bound work; provider requests time out and rate-limit retries are bounded. No
provider credentials are sent to browsers or supplied as runner arguments.

After deployment and warm-up, the shared deployment workflow runs the job with
`--if-missing` in **every environment**. An existing published catalogue,
including a stale one or one inherited by a preview database branch, skips all
preflight and provider requests. An empty catalogue is initialized after taking
the database lock and rechecking publication. If another refresh holds the lock,
initialization waits within its deadline until data is available or it can take
over. A lock-only skip cannot report successful initialization.

Initialization failure fails the deployment check without rolling back or
stopping the deployed app. Inspect the job/provider-usage logs, correct the
failure, then rerun the failed deployment job; initialization is idempotent. The
deployment workflow allows 50 minutes for app deployment and the bounded
initialization job. This path also works before a newly introduced manual
workflow becomes available on GitHub's default branch.

GitHub job summaries report safe completion counts, existing-catalogue skips
without provider calls, or failure/retry guidance; they never include raw
provider responses or credentials.

For a deliberate full refresh after deployment, use the manual workflow
(available once the workflow is on `main`):

```sh
gh workflow run refresh-securities.yml --ref main -f environment=staging
gh workflow run refresh-securities.yml --ref main -f environment=prod
# Use the existing preview app/region shown by its deploy workflow:
gh workflow run refresh-securities.yml --ref main -f environment=preview \
  -f preview_app=cashfolio-app2-pr-504-security-search-storybook -f preview_region=cdg
```

Dispatch uses the corresponding protected GitHub environment's Fly token.
Preview targets must match the repository's preview naming convention. Deploy a
compatible image before dispatching. The worker prints safe smoke/progress and
terminal summary messages; inspect those and provider-usage reporting after a
failure, correct configuration/entitlements if needed, then dispatch again.

First run `pnpm --filter cashfolio-app2 build:securities-refresh`. For a local
preflight only (no bulk refresh), supply the existing API key via the
environment and run `pnpm --filter cashfolio-app2 refresh:securities --smoke`.
Bulk local refresh also requires `DATABASE_URL`; run without `--smoke` only when
intentionally populating that database. Use `--if-missing` for idempotent
initial setup; an existing catalogue succeeds without `MARKETSTACK_API_KEY` or
provider calls. Do not combine `--smoke` and `--if-missing`. No credentials
belong in fixtures.

On 2026-11-16, a small authenticated staging smoke check confirmed the catalogue
shape (`ticker`, `stock_exchange`, `has_eod`), exchange `country_code`, and
exchange-aware EOD shape (`symbol`, `exchange`, `close`, `price_currency`,
`asset_type`). The refresh preflight repeats catalogue/EOD checks before bulk
work. Automated tests always use fixtures.

## Verification

Focused unit tests cover authentication, validation, parsing, cache isolation,
provider failures and the Fly runner. The general database integration CI suite
owns `src/securities-refresh/catalogue.integration.ts`: atomic publication,
failed-refresh preservation, pagination, locking, versioned queries and
idempotent/concurrent initialization. The mocked Securities E2E flow covers
sidebar navigation, exact exchange selection and chart ranges. Full
suites/builds and database-backed runs remain CI checks.

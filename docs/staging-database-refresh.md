# Synthetic staging data

Every staging and preview application deployment applies migrations and replaces
application data with the shared synthetic dataset. Production remains
migration-only. Missing approved seed settings fail the nonproduction release;
there is no seed enablement flag or silent migration-only fallback.

The release command verifies both the seed connection and migration connection
read-only before migrations, grants narrowly scoped seed permissions after
migrations, then replaces application data in one transaction. The replacement
locks all seven application tables against concurrent writes and verifies server
identity again inside the transaction. Any failure fails the release before web
Machines update. Transaction conflicts/deadlocks get at most three attempts,
with 100 ms and 200 ms retry delays; other failures fail immediately.

Seed accounts are checked with shared application account validation before the
replacement transaction begins and before direct seed insertion writes. Invalid
input is rejected with its book/account key, rather than silently corrected.
Equity accounts (income, expense, Gain/Loss, and Opening Balances) must not
contain unit, currency, cryptocurrency, symbol, or trade-currency metadata.
Those fields belong to their bookings; for example, the Bitcoin network-fee
booking carries BTC metadata while its expense category has none. Application
create/update requests retain their existing normalization of hidden category
unit fields before validation.

The corrected fixtures take effect through the normal staging refresh or
deployment; changing them does not immediately modify deployed data.

The `Refresh staging database` workflow still rebuilds and redeploys staging
daily at 03:30 Europe/Zurich, and supports manual dispatch from `main`. Staging
stays on its existing database. Preview databases are independent, initially
empty databases on a fixed preview-only host; see
[Preview environments](preview-environments.md).

The history covers the rolling three years through today's Zurich calendar date,
uses CHF as the reference currency, and includes Swiss household income,
expenses, savings, debt, foreign currencies, investments, cryptocurrency,
transfers, archived accounts and groups, split transactions, and transaction
notes. Configured testers receive access to the seeded books. Existing
configured tester `User` rows retain their IDs, roles, and locales; other
application users and all existing books, links, accounts, groups, transactions,
and bookings are removed. Logto identities are never created, modified, or
deleted by the seed. Book IDs are freshly generated each run, preventing stale
period-cache reads; previous staging deep links become invalid. Shared
market-rate caches remain available and old period-cache entries expire
normally.

Opening a previous book URL after replacement shows the app's **Page Not Found**
page with HTTP 404. Select **Go to App** to return through `/` and open a
current accessible book. Book IDs intentionally change on every replacement; old
deep links are not redirected to a different book automatically.

The seeded books are named `1. Swiss Household Demo`, `2. Valuation Edge Cases`,
and `3. Empty Demo`. Numeric prefixes put the household first and the empty book
last in the existing alphabetical account-book selector.

The household uses practical categories without redundant account-type wrapper
groups. Cash accounts include
`Cash → Zürcher Kantonalbank → Everyday account CHF`, with additional accounts
under PostFinance and Swissquote and a cash wallet directly under Cash.
Investments contain Shares and Cryptocurrencies subgroups. Housing, Daily
living, and Leisure and travel are top-level expense groups; income, debts,
Taxes, and Bank and trading fees are ungrouped. Closed accounts stay under their
real institutions, with archived groups retaining their original subtrees.

Staging account fixtures include explicit, curated asset classes for both active
and archived accounts:

| Demo accounts                                                                                | Asset class             |
| -------------------------------------------------------------------------------------------- | ----------------------- |
| Bank, savings, cash wallet, broker cash, settlement and transfer accounts; Pillar 3a savings | Cash & Cash Equivalents |
| Apple and Microsoft positions                                                                | Equities                |
| Bitcoin and Ethereum accounts, including transfer accounts                                   | Digital Assets          |
| Managed Portfolio CHF; credit-card and loan accounts                                         | Other Assets            |
| Unlisted investment in Valuation Edge Cases                                                  | Alternative Investments |

Income, expense, Opening Balances and system Gain/Loss accounts remain
Unclassified. These assignments are staging examples, independent of Unit,
cash-flow eligibility and valuation configuration. Ordinary new accounts and
seed accounts without an explicit selection still default to Unclassified;
classification remains manual, with no inference or backfill. The Empty Demo
stays empty apart from its system Gain/Loss account. The curated values take
effect through the normal staging refresh or deployment; editing the fixtures
does not reset deployed staging immediately.

## Test a manually valued managed portfolio

In `1. Swiss Household Demo`, open `Investments → Managed Portfolio CHF`. This
non-cash CHF asset account tracks the reported total value of a discretionary
portfolio. It has no individual security or crypto holdings and requires no
market quotes. See the
[manual Gain/Loss workflow](../apps/cashfolio-app2/docs/ui-patterns.md#explicit-gainloss-for-manually-valued-accounts).

The portfolio starts with CHF 50,000 on the book's opening-balance date and
includes three years of cash flows and monthly statement valuations:

| Event               | Schedule                                          | Bookings                                         |
| ------------------- | ------------------------------------------------- | ------------------------------------------------ |
| Contribution        | Fifth of each month                               | Everyday account CHF −250; portfolio +250        |
| Withdrawal          | June 20 each year                                 | Portfolio −1,000; Everyday account CHF +1,000    |
| Statement valuation | Historical month-end; today for the current month | Portfolio adjustment; opposite Gain/Loss booking |

Only cash-flow dates within the book's active range through today are included.
Statement adjustments repeat **+600, −350, +450, +250, −200, +500 CHF**,
beginning with the book's first calendar month. These synthetic changes
represent the difference between a statement's reported value and the balance
after cash flows. They are not contributions, withdrawals, or automatically
calculated holding returns. Search for `Managed portfolio:` to find the
transactions. The previous cash rounding adjustment is no longer seeded.

In the portfolio ledger, inspect the running balance and the separate
contribution, withdrawal, and statement valuation transactions. In Report,
switch Gains/Losses to Table and inspect `Other Assets → Managed Portfolio CHF`;
double-click the portfolio row to open its unified gain/loss explanation for
that period. Recorded Adjustments lists the statement valuations and links to
their full transactions in Transactions for the selected report period,
including bookings outside that period. In History, select Gains/Losses and the
`Other Assets / Managed Portfolio CHF` scope to inspect the monthly series.

For the automated fixture dated **2026-10-10**, there are 37 statement
valuations with **CHF 8,100** cumulative explicit gains, CHF 9,000 of
contributions, and CHF 3,000 of withdrawals. The portfolio balance is **CHF
64,100**. October 2026 has a CHF 600 explicit gain; November 2023 has a CHF 350
explicit loss. These CHF figures are independent of live market rates. For other
seed dates, cash-flow counts and the final balance follow the schedule above.

The example becomes available through the normal enabled staging refresh or
deployment; changing the seed source does not reset staging immediately.

## Test archived groups and accumulated G/L

The household includes closed bank accounts under Zürcher Kantonalbank and
PostFinance, plus an archived UBS group under Cash. There is no separate real
“Former bank accounts” group. Virtual **Archived** rows are generated by
Accounts; they use a muted archive icon and label with the explanation “Archived
items grouped automatically. Included in totals.” The chevron and amounts retain
their normal contrast.

Expand the asset/liability paths in the unified Accounts grid. Income and
expense paths are in Account Book Settings → Categories with **Show Archived**
enabled:

| Tab       | Display path                                                                                  |
| --------- | --------------------------------------------------------------------------------------------- |
| Asset     | Cash → Zürcher Kantonalbank → Archived → Closed bank account CHF                              |
| Asset     | Cash → PostFinance → Archived → Closed travel account EUR                                     |
| Asset     | Cash → Archived → UBS → Savings account CHF / USD                                             |
| Asset     | Investments → Shares → Archived → Closed Apple position                                       |
| Asset     | Investments → Archived → Credit Suisse portfolio → Equities → Apple shares / Microsoft shares |
| Liability | Archived → Repaid car loan CHF                                                                |
| Income    | Archived → Consulting → One-off project                                                       |
| Expense   | Archived → Car → Running costs → Fuel / Vehicle insurance                                     |
| Expense   | Leisure and travel → Archived → Sports club membership                                        |

The archived Credit Suisse portfolio also contains a Settlement account USD. It
is funded from active broker cash on day 45 after book start, buys holdings on
day 60, sells them on day 120, and sweeps the remaining USD 3,600 back on
day 150. A separate Apple position settles through active broker cash on days 61
and 121, so its executions have distinct dates from the portfolio trades. These
small histories are independent of the ongoing active share purchases and
Bitcoin transfer example.

| Closed holding                   | Purchase | Sale     | Realised difference in USD | CHF under E2E's fixed USD/CHF rate of 0.5 |
| -------------------------------- | -------- | -------- | -------------------------- | ----------------------------------------- |
| Closed Apple position            | 2 × 100  | 2 × 120  | +40                        | +20                                       |
| Credit Suisse / Apple shares     | 10 × 150 | 10 × 180 | +300                       | +150                                      |
| Credit Suisse / Microsoft shares | 4 × 400  | 4 × 350  | −200                       | −100                                      |
| Credit Suisse portfolio subtotal |          |          | +100                       | +50                                       |

All archived Asset/Liability balances are zero, and the closed investments have
zero Unrealised G/L while retaining their Realised G/L. Historical income and
expense balances remain nonzero. CHF cash does not have applicable holding G/L.
Group and footer amounts include archived leaves even while their paths are
collapsed. Check the same totals before expanding, after expanding the complete
portfolio, and after collapsing it again.

The USD differences above are fixed by the bookings. Live staging CHF figures
use actual historical market/FX data, including any FX result on foreign cash;
they need not match the E2E conversion column. The E2E provider fixture supplies
matching historical execution quotes for these six trades, avoiding artificial
residual allocations from the generic test quotes. Missing-valuation examples
stay in `2. Valuation Edge Cases`.

## Test a holding transfer with fees

In `1. Swiss Household Demo`, open
`Investments → Cryptocurrencies → Bitcoin transfer source` or
`Bitcoin transfer destination`. The separate `Bitcoin transfer fees` expense
account is denominated in BTC. These accounts have no opening holdings and are
independent of the existing Bitcoin savings activity.

Search for `Bitcoin transfer demo` to find three transactions. Dates are
relative to the seed's Zurich calendar date and move with each refresh:

| Date           | Transaction                                      | Bookings                                                    |
| -------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| Today −21 days | Bitcoin transfer demo: purchase                  | Source +0.01 BTC; Everyday account CHF −1,000 CHF           |
| Today −14 days | Bitcoin transfer demo: transfer with network fee | Source −0.01 BTC; destination +0.0099 BTC; fees +0.0001 BTC |
| Today −7 days  | Bitcoin transfer demo: partial sale              | Destination −0.004 BTC; Everyday account CHF +600 CHF       |

Use the unfiltered ledger's **G/L Since Start** and **View Calculation** to
inspect the original CHF 100,000-per-BTC cost and acquisition date. The transfer
carries CHF 990 of acquisition cost to the destination without realising G/L on
that quantity. The source realises G/L only on the 0.0001 BTC fee, whose cost is
CHF 10; its execution value comes from the transfer-date quote.

After the sale, the source balance is zero and the destination holds **0.0059
BTC** with **CHF 590** remaining acquisition cost. The destination's accumulated
realised G/L is **CHF 200** (CHF 600 proceeds less CHF 400 original cost). Those
figures are fixed by the seed. The fee's realised G/L and the destination's
unrealised G/L depend on market quotes. Report and History retain their
period-opening valuation semantics, so their period splits can differ from
accumulated G/L.

The scenario becomes available through the normal enabled staging refresh or
deployment; adding it to the seed source does not reset staging immediately.

## Configure the approved target

Before deploying the shared release runner, install these secrets on the staging
Fly app. Use a protected file (mode `0600`) and `flyctl secrets import --stage`
with stdin so values do not appear in shell history or command arguments.

- `SEED_DATABASE_URL`: direct verified-TLS connection for the existing dedicated
  `cashfolio_staging_seed` role. It has no fallback to the app's `DATABASE_URL`.
- `SEED_TARGET`: the exact reviewed JSON destination below, including the actual
  staging Fly app name and actual migration role from `DATABASE_URL`.
- `SEED_USER_EXTERNAL_IDS`: nonempty comma-separated tester Logto external IDs.
- `SEED_ADMIN_EXTERNAL_IDS`: nonempty comma-separated administrator external
  IDs, all also present in the tester list. These only bootstrap a fully empty
  application database. Existing databases must retain a configured, active
  administrator; seeding never promotes another tester in a nonempty database.

```json
{
  "environment": "staging",
  "flyApp": "your-staging-fly-app",
  "hostname": "ep-approved-staging.eu-central-1.aws.neon.tech",
  "projectId": "approved-project-id",
  "branchId": "br-approved-staging",
  "endpointId": "ep-approved-staging",
  "database": "neondb",
  "role": "cashfolio_staging_seed",
  "migrationRole": "neondb_owner"
}
```

The environment and Fly app must match the running Machine's `APP_ENVIRONMENT`
and `FLY_APP_NAME`. Both connections must identify the exact project, fixed
branch, endpoint, database and their respective approved roles. Missing or
mismatched metadata fails closed. The seed URL must be direct, port 5432, with
`sslmode=verify-full`; a same-endpoint pooled migration URL may use
`sslmode=require`, but preflight still verifies its TLS certificate. Routing
options, duplicate query parameters and `PGOPTIONS` are forbidden.

Keep the old `STAGING_SEED_*` secrets until the first new staging release
succeeds, then remove them and the obsolete `STAGING_SEED_ENABLED` GitHub
variable. New code reads only `SEED_*`. Do not place staging seed credentials on
preview apps or production. Preview settings are generated by trusted
provisioning with a separate database and role for each PR.

Configured testers preserve their IDs, locales and roles. Newly added testers
receive no administrator role unless explicitly configured for bootstrap in an
otherwise completely empty application database. Logto identities are untouched.

## Provision isolated seed credentials

Neon roles are branch-scoped and parent roles are copied into newly created
child branches. The inherited `neondb_owner` role does not establish production
credential isolation. Create the following role through an interactive SQL
session connected to **the approved staging branch only**, after its existing
migrations have been applied:

```sql
CREATE ROLE cashfolio_staging_seed
  LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- In psql, set a newly generated, independently stored password without placing
-- its plaintext value in SQL, shell history, or deployment logs:
\password cashfolio_staging_seed

GRANT CONNECT ON DATABASE neondb TO cashfolio_staging_seed;
GRANT USAGE ON SCHEMA public TO cashfolio_staging_seed;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "User", "UserAccountBookLink", "AccountBook", "AccountGroup", "Account",
  "Transaction", "Booking"
TO cashfolio_staging_seed;
GRANT EXECUTE ON FUNCTION public.ensure_gain_loss_account_for_new_book()
TO cashfolio_staging_seed;
```

Adjust the database name to the reviewed target. Do not create this role through
shared migrations, the Neon Console/API's privileged role-creation flow, or a
production SQL session. It needs no schema ownership, migration permissions,
role membership, `TRUNCATE`, or `neon_superuser` membership. Add explicit grants
when future seed changes require additional application tables.

Before enabling seeding, use an independently authorized read-only production
connection to confirm that the role is absent:

```sql
SELECT rolname FROM pg_roles WHERE rolname = 'cashfolio_staging_seed';
```

Require zero rows. Also attempt authentication against the production endpoint
using the new seed role and password and require an explicit authentication
rejection from the reachable production service. A network failure, timeout, or
DNS error does not establish credential isolation. Do not record the password or
connection string in the evidence. Keep only the reviewed endpoint identifiers
and the successful staging/failed production authentication outcome. A uniquely
named staging-only role provides isolation without changing projects. The fixed
preview host has independent roles and receives no staging seed secrets.

## Validate before deployment

Read the following through each staging connection before any replacement:

```sql
SELECT
  current_setting('neon.project_id', true) AS project_id,
  current_setting('neon.branch_id', true) AS branch_id,
  current_setting('neon.endpoint_id', true) AS endpoint_id,
  current_database() AS database_name,
  current_user AS role_name;
```

The seed requires exact approved project, branch, endpoint, and database
matches; its connection must also report the dedicated seed role. These Neon
settings are supplied by the compute and cannot be changed by the session.
Missing, empty, or mismatched settings fail closed. The migration connection
must identify the same approved staging database. Verify that staging has the
settings and that production authentication with the seed credentials fails
before deploying the shared seed release. The first shared staging release
repeats this read-only preflight before migrations, then validates again before
replacement.

The source of truth for branch-scoped roles is
[Neon's role documentation](https://neon.com/docs/manage/roles). Server identity
settings are defined by the
[Neon extension](https://github.com/neondatabase/neon/blob/main/pgxn/neon/libpagestore.c)
and populated by its
[compute configuration](https://github.com/neondatabase/neon/blob/main/compute_tools/src/config.rs).

## Preview lifecycle and verification

Previews create empty databases and run migrations plus this same seed code on
every deployment. They no longer copy staging data or create Neon child
branches. An initial seed creates only explicitly configured administrator
identities; subsequent replacements preserve configured tester permissions. See
[Preview environments](preview-environments.md) for provisioning and cutover.

Verify login and tester book access, sharing and admin access for appropriately
configured roles, accounts and nested/archived groups, today and historical
ledgers, search/filter/sorting, reports and period comparisons, CHF valuation of
foreign currencies/securities/crypto, transfers and split transactions,
transaction editing and deletion, and statement imports. Editing remains
interactive; the next staging deployment restores the synthetic dataset.

After the seed bundle has been built, produce the import fixture without a
connection to any database:

```bash
node apps/cashfolio-app2/dist/staging-seed/seed.mjs --sample-csv > /tmp/cashfolio-staging-import.csv
```

Import this file into `Everyday account CHF` with its configured CSV format. API
keys and shared staging Redis still supply market rates; the seed does not
replace market data with mocked quotes.

## Restricted compatibility checks

For schema migrations or substantial report changes, supplement synthetic
regression tests with the following operator-run comparison. This PR documents
the procedure only; it adds no snapshot service, production-copy automation, or
production-shaped data to staging, normal previews, or CI artifacts.

1. Name the comparison owner and record a deletion deadline no later than 48
   hours after snapshot creation. Select a recent, full-size production snapshot
   using independently authorized read-only source access. Restore it into a
   restricted disposable environment with its own database credentials and cache
   namespace; give regular staging/preview testers no access. Source access must
   remain read-only throughout the comparison.
2. Before running candidate application code, sanitize the restored data in the
   disposable environment. Remove authentication identities and access links,
   replace user/book/account/group/transaction/booking identifiers consistently
   with pseudonyms, and remove or replace book/account/group names and
   transaction/booking free text. Preserve relationships, row counts, unusual
   record shapes, and representative dataset size. Amounts and dates remain
   sensitive even after this sanitization; retain the same restricted access.
3. Provide only the isolated disposable credentials to the comparison process.
   Keep its cache separate from staging and production, disable external
   identity management and outbound identity-provider writes, and ensure
   authentication configuration cannot grant production-user access. If test
   access is needed, create an isolated tester mapping after sanitization. The
   disposable environment must never become the parent of normal preview
   branches.
4. Run the current application and candidate version against separate disposable
   copies of the sanitized snapshot. Apply the candidate migrations to its copy.
   Use identical fixed valuation inputs and as-of dates for both runs so
   changing market quotes cannot explain differences. Compare persisted row
   counts, balances, cash flow, gains/losses, and historical period reports,
   including archived accounts, foreign units, split transfers, and unusual
   older records. Exercise the full-size data and record query/report runtimes
   as well as correctness; investigate unexpected differences before rollout.
5. Convert discovered edge cases into small synthetic regression fixtures
   without copying sensitive identifiers, free text, amounts, or dates. Add
   those fixtures to the repository's normal automated tests and rerun them
   against the candidate. Keep comparison outputs in the restricted workspace
   only, never in normal CI uploads or regular preview applications.
6. Have the named owner delete every snapshot, disposable database/environment,
   temporary tester mapping, isolated credentials, caches, and comparison output
   immediately after the decision and always before the recorded 48-hour
   deadline. Record completion using only nonsensitive comparison findings and
   cleanup confirmation; if the check is incomplete at the deadline, delete the
   environment and start a separately approved comparison later.

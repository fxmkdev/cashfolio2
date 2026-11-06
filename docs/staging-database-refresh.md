# Synthetic staging data

Every staging and preview application deployment verifies the destination,
applies migrations and replaces application data with the shared synthetic
dataset. Production remains migration-only. Missing approved seed settings fail
the nonproduction release; there is no seed enablement flag or silent
migration-only fallback.

The release command verifies the application connection read-only before
migrations, then replaces application data in one transaction using the same
database-owner login. The replacement locks all ten application tables against
concurrent writes and verifies server identity again inside the transaction. Any
failure fails the release before web Machines update. Transaction
conflicts/deadlocks get at most three attempts, with 100 ms and 200 ms retry
delays; other failures fail immediately.

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
empty databases on staging’s existing fixed host; see
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

## Test gain/loss asset-class grouping

In `1. Swiss Household Demo`, the transaction
`Grouping demo: EUR card purchase settled in CHF` is dated two Zurich calendar
days before the seed date. Reports stop at yesterday in UTC; the two-day gap
keeps the demo reportable immediately after a refresh, even shortly after Zurich
midnight when UTC is still on the previous date. It debits
`Everyday account CHF` by CHF 105 and books EUR 100 to the `Travel` expense
category using booking-level currency metadata. Travel remains Unclassified and
has no account-level currency configuration.

The difference between the converted EUR expense and the CHF settlement creates
an execution residual on Travel. Its single originating financial account is
Everyday account CHF, so the gain/loss entry inherits that account's Cash & Cash
Equivalents classification. This grouping does not change Travel's own asset
class or move the residual into Everyday account CHF's gain/loss total.

Open **Report** for the month containing the transaction: normally the seed's
current month, or the previous month when refreshed on the first or second day.
For example, an October 31 refresh dates the transaction October 29; a January 1
refresh dates it December 30 of the previous year. Switch **Gains/Losses
Breakdown** to **Table**, expand **Cash & Cash Equivalents → EUR**, and
double-click **Travel**. The detail page shows an **Execution Residuals** row
and this explanation:

> Grouped under Cash & Cash Equivalents based on the originating account:
> Everyday account CHF.

Use **Open Transaction** on the residual row to inspect the card purchase. Live
staging amounts depend on the historical EUR/CHF rate for the booking date. At
EUR/CHF 0.95 the residual is CHF −10; the existing fixed E2E rates (EUR/CHF =
0.5 / 1.1) produce CHF −59.55. Both bookings move together with the seed date,
including month/year transitions and leap day.

## Test currency gain/loss grouping

The household book includes active **Broker cash USD** (Swissquote) and **USD
Savings Account** (Zürcher Kantonalbank) accounts. Both are cash accounts
classified as Cash and Cash Equivalents with Individual Units tracking. The
savings account opens with USD 1,250 and receives USD 100 against CHF 90 from
the everyday account on the sixth of each month within the generated date range.
Search for `USD savings: monthly currency exchange` to inspect these transfers.

In Report, drill into **Cash & Cash Equivalents → USD** to see both accounts.
Each double-click advances one level, including units with only one account;
opening account details requires a separate double-click on the account bar. The
table's USD group aggregates the account contributions. History exposes the same
USD grouping and individual account scopes.

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
switch Gains/Losses to Table and inspect
`Other Assets → Managed Portfolios → Managed Portfolio CHF`; double-click the
portfolio row to open its unified gain/loss explanation for that period.
Recorded Adjustments lists the statement valuations and links to their full
transactions in Transactions for the selected report period, including bookings
outside that period. In History, select Gains/Losses and the
`Other Assets / Managed Portfolios / Managed Portfolio CHF` scope to inspect the
monthly series.

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

## Configure provisioning and tester access

Staging and previews use the same Neon API helper. Configure `NEON_API_KEY` and
`NEON_PROJECT_ID`, plus `SEED_USER_EXTERNAL_IDS` and `SEED_ADMIN_EXTERNAL_IDS`
as shared repository settings or in their existing GitHub environments. The API
key and tester/admin IDs are secrets; the project ID is a variable. Environment
settings override repository defaults. See
[Nonproduction configuration and cutover](preview-environments.md#configuration).
The helper discovers the default Neon branch and existing database owner,
creates or reuses the current Git branch's exact database, then stages
`DATABASE_URL`, `SEED_TARGET` and tester/admin IDs before deployment. Staging
releases from tags use the repository's default Git branch.

No manual target JSON, seed connection, permission-grant phase, database role or
SQL bootstrap is required. `DATABASE_URL` serves application access, migrations
and seeding. Staging switches to a new branch-derived database on cutover; old
synthetic data is not migrated.

Tester and administrator IDs are nonempty comma-separated Logto external IDs.
Administrators must be included among testers. Explicit administrator settings
bootstrap only entirely empty application databases. Existing data requires a
retained active administrator; another tester is never promoted during
replacement.

## Destination protection

The approved environment and Fly app must match `APP_ENVIRONMENT` and
`FLY_APP_NAME`. The URL and server-reported project, branch, endpoint, database
and role must exactly match the API-generated target. This read-only
verification runs before migrations and again inside the replacement
transaction. Missing or mismatched configuration fails deployment. Production
remains migration-only, and the seed CLI rejects production environments before
any connection or write.

A direct application URL can use `sslmode=verify-full` or `sslmode=require`; a
pooled URL must identify the same approved endpoint. The `pg` client verifies
TLS certificates explicitly in either case. Prisma receives a subprocess-only
copy with `sslmode=require&sslaccept=strict` so its migration connection also
verifies certificates. Duplicate parameters, routing overrides and `PGOPTIONS`
are forbidden; the parent application URL is unchanged.

Production is in a separate project. Ensure the shared nonproduction password is
not valid there, even if the role name is the same. Verify an authentication
rejection against the reachable production endpoint before rollout; a timeout or
DNS error does not demonstrate credential separation. Do not record passwords or
connection strings. Keep production credentials out of preview workflows/apps.

Server identity settings are defined by the
[Neon extension](https://github.com/neondatabase/neon/blob/main/pgxn/neon/libpagestore.c)
and its
[compute configuration](https://github.com/neondatabase/neon/blob/main/compute_tools/src/config.rs).

The target is generated on every deployment from Neon metadata, including the
exact environment, Fly app, host, project, branch, endpoint, database and role.
The API key never enters the app. Retire old manual target/provisioning settings
and legacy roles only after successful cutover and confirming they are unused;
see the [cutover instructions](preview-environments.md#cutover-and-operation).
No legacy role or privilege changes happen automatically.

Configured testers preserve their IDs, locales and roles. Newly added testers
receive no administrator role unless explicitly configured for bootstrap in a
fully empty database. Sessions belonging to retained testers and anonymous
sign-in sessions are preserved. Deleting nonconfigured users also deletes their
sessions through the existing foreign-key cascade. Permanent authentication
revocation markers and Logto identities are untouched. Preview deployments
rotate their session encryption secret, so testers must sign in again after a
preview release. Shared market-rate caches remain intact.

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

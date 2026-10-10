# Synthetic staging data

Every staging application deployment can replace its application data with a
synthetic personal-finance dataset. Seeding is initially disabled until the
operator completes the destination and credential checks below. Production and
preview releases always use the migration-only release command.

When enabled, the staging release command first verifies both the dedicated seed
connection and the application's migration connection read-only, applies Prisma
migrations, and replaces the application data in one transaction. The reset
locks all seven application tables against concurrent writes; reads continue and
waiting edits resume after commit. Any validation, migration, or seed failure
fails the release before application Machines update. Deployments for the same
environment are serialized across main builds, manual Deploy runs, and the daily
refresh workflow.

The `Refresh staging database` workflow rebuilds and redeploys staging daily at
03:30 Europe/Zurich, keeping the dataset current even without code changes. It
also supports manual runs from `main`. It no longer resets staging from
production. The two UTC schedules retain exactly one run for Zurich's current
UTC offset.

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

## Configure the approved target

In the `staging-cashfolio-app` GitHub environment, configure:

- Secret `STAGING_SEED_DATABASE_URL`: a **direct** Neon connection string for
  the dedicated `cashfolio_staging_seed` role created only on staging. Never use
  the production owner credential. There is no fallback to `DATABASE_URL`.
- Variable `STAGING_SEED_TARGET`: JSON containing the reviewed destination
  below.
- Variable `STAGING_SEED_USER_EXTERNAL_IDS`: a comma-separated list of tester
  Logto external IDs. Include an existing staging administrator; replacement
  fails before removing data if no configured tester already has `ADMIN`. Use at
  least two tester identities to exercise sharing. Roles are preserved; new app
  users receive no administrator role automatically.
- Variable `STAGING_SEED_ENABLED`: keep `false` or unset until all checks pass;
  set exactly `true` afterward. Other nonempty values fail the staging release.

```json
{
  "hostname": "ep-approved-staging.eu-central-1.aws.neon.tech",
  "projectId": "approved-project-id",
  "branchId": "br-approved-staging",
  "endpointId": "ep-approved-staging",
  "database": "neondb",
  "role": "cashfolio_staging_seed"
}
```

Obtain these identifiers from the reviewed Neon staging branch and its primary
compute. Compare them against the existing preview `NEON_STAGING_PROJECT_ID` and
`NEON_STAGING_BRANCH_ID`; those variables must still identify this same staging
branch. Exact hostname matching is required, including the actual region. The
seed rejects pooled endpoints, routing overrides, and a mismatched database or
role. Use port 5432 and `sslmode=verify-full`; the client verifies certificates.

When seeding is enabled, CI stages the three seed configuration values as Fly
secrets on staging only, keeping the JSON out of generated TOML. The application
migration connection remains the existing Fly `DATABASE_URL`. The seed URL
provides only data permissions and is never used to run migrations. Do not set
these secrets on production or preview Fly apps.

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
named staging-only role provides isolation without changing projects. New
preview branches inherit that role, but do not receive the staging seed secret
and cannot pass the approved-target checks.

## Validate and enable

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
before setting `STAGING_SEED_ENABLED=true`. The first enabled staging release
repeats this read-only preflight before migrations, then validates again before
replacement.

The source of truth for branch-scoped roles is
[Neon's role documentation](https://neon.com/docs/manage/roles). Server identity
settings are defined by the
[Neon extension](https://github.com/neondatabase/neon/blob/main/pgxn/neon/libpagestore.c)
and populated by its
[compute configuration](https://github.com/neondatabase/neon/blob/main/compute_tools/src/config.rs).

## Preview lifecycle and verification

New Neon preview branches copy the seeded staging database when they are
created. Existing preview branches are reused and keep their current data; they
are neither reset nor reseeded on subsequent PR deployments. To exercise the new
dataset in an existing preview, use an explicitly reviewed recreation of that
preview branch/app or open a new preview after staging has been seeded. See
[Preview environments](preview-environments.md).

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

The existing local `sync-account-book` operator command is not part of the
synthetic staging deployment or daily refresh path. This procedure does not
recommend copying raw production data into default staging.

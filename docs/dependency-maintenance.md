# Dependency maintenance

The October 2026 refresh updates stable releases within the existing major
versions, plus Logto 4, Chromatic 18, and dotenv 18. Node runtime and typings
stay on 24, and pnpm stays on 11. Package families such as Mantine, React,
Prisma, Storybook, AG Grid, AG Charts, and Vitest must be updated together.

The refreshed manifest versions are:

| Package family                           | Version                  |
| ---------------------------------------- | ------------------------ |
| Mantine                                  | 9.7.1                    |
| React / React DOM / their typings        | 19.3.0                   |
| TanStack Router / Start                  | 1.170.41 / 1.168.60      |
| Prisma CLI / client / PostgreSQL adapter | 7.10.0                   |
| Vite                                     | 8.3.4                    |
| Storybook                                | 10.6.1                   |
| Playwright                               | 1.64.0                   |
| AG Grid / AG Charts                      | 35.3.1 / 14.2.0          |
| Vitest / coverage                        | 4.1.11                   |
| MSW                                      | 2.15.0                   |
| Logto / Chromatic / dotenv               | 4.0.0 / 18.11.0 / 18.0.6 |
| Redis / PostgreSQL driver                | 6.3.0 / 8.23.1           |
| Node runtime / typings                   | 24.21.0 / 24.19.1        |
| pnpm / Prettier                          | 11.28.5 / 3.9.9          |

TypeScript 7, Vitest 5, MSW 3, AG Grid 36, pnpm 12, and Prisma prereleases are
deferred to separate migrations. Keep the exact Storybook test-runner pin. See
the app's
[Nitro compatibility notes](../apps/cashfolio-app2/docs/deployment.md#nitro-version-pin)
before revisiting its beta pin or scoped H3 override.

The pinned Storybook test-runner uses Jest 30.4.2 through a scoped override.
Jest 30.5 rejects the Node loader hooks that Storybook 10.6 uses to load the
test-runner configuration. Revisit this override with the test-runner migration.

Security overrides live in `pnpm-workspace.yaml`. Prefer compatible upstream
updates; use scoped overrides where the parent still locks an affected version.
Remove an override only after confirming the lockfile resolves patched versions
and the relevant checks pass. Preserve the release-age policy; existing
exceptions for the project's releaser package should name its current pin.

Prisma 7.10 still requests `deepmerge-ts@7.1.5`, so a scoped
`@prisma/config>deepmerge-ts` override selects the patched `8.0.2` release.
Prisma uses the public `deepmerge` export to load plain configuration objects.
The version 8 changes to Map merging and renamed custom-merge types do not
affect this configuration shape. Configuration loading, client generation,
schema validation, and migration SQL generation must remain covered when
revisiting this override. Remove it when Prisma resolves a patched release
without the override. See the
[version 8 release notes](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0)
and
[recursive merge advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).

## Remaining audit findings

As of 2026-10-09, after the scoped Prisma override, `pnpm audit` reports one
moderate finding, with no high or critical findings, down from 112 findings
before the refresh:

| Dependency         | Path                                      | Severity | Follow-up                                                                                                                                                                                   |
| ------------------ | ----------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sprintf-js@1.0.3` | Storybook test-runner's Jest dependencies | Moderate | The [precision-specifier advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) has no published patched version. Revisit when a fix or compatible upstream replacement is available. |

These counts describe the dependency audit, not an assessment of reachability in
the running application. Re-run the audit when updating dependencies because
advisories and published fixes can change.

## Refresh verification

Prisma generation, app typecheck/lint/format, all 994 unit tests, the coverage
ratchet, production build, Storybook build and all 89 interaction tests, and all
44 application E2E tests passed. The CLI typecheck, all 11 CLI tests, and
startup help passed. Frozen-lockfile installation and workflow lint also passed.
The coverage baseline was not lowered.

Synthetic dotenv checks covered file loading, existing environment-variable
precedence, Prisma generation without a database URL, and rejection of migration
configuration without a URL. A Redis client connected and issued a TimeSeries
command using the app's existing RESP2 settings.

Production-mode Logto checks verified a real provider authorization redirect
with PKCE/state and a secure cookie, invalid-callback rejection, and same-origin
sign-out clearing encrypted session data. A full authenticated sign-in/callback/
sign-out session in preview was not completed because interactive login
credentials were unavailable; the E2E authentication bypass does not cover it.

The scoped `deepmerge-ts` follow-up passed frozen-lockfile installation, Prisma
configuration loading with and without a database URL, client generation, schema
validation, and migration SQL generation without a database connection. App
typecheck, lint, formatting, all 994 unit tests, the production build, and CLI
typecheck also passed. Database-backed migrations and application E2E tests
remain part of the CI gate.

## AG Charts 14 migration

The three standalone Charts packages (`ag-charts-community`,
`ag-charts-enterprise`, and `ag-charts-react`) use `^14.2.0` and resolve to
14.2.0. Registry metadata checked on 2026-10-09 identified it as the latest
stable release, published on 2026-09-16, beyond pnpm 11's default one-day
release-age threshold. The policy and existing exceptions remain unchanged. AG
Grid stays on main's 35.3.1; its optional Charts 13 dependencies can coexist
because the app uses standalone Charts, without integrated Grid chart modules.

The
[official v14 migration guide](https://www.ag-grid.com/charts/react/upgrade-to-ag-charts-14/)
changes waterfall aggregate callbacks: totals/subtotals have undefined source
data. Contribution tooltips use `itemType` to select the heading and amount from
the existing model. Gains/losses tooltips use the model total, and aggregate
double-clicks are ignored while ordinary-node drilldowns remain. Total styling
belongs under `item.total`; removing unsupported top-level `total`, `subtotal`,
and `itemStyler` options eliminates their runtime warnings and makes the
configured blue aggregate bars visible. The selective registry now includes
`CrossLinesModule` for report/history zero lines and the current history period
band.

Numeric axis labels pass bigint values directly to `Intl.NumberFormat`. History
zoom boundaries support v14 grouped/bigint values, converting only safe
timestamp integers at the display boundary. Decimal calculations, currency
conversions, `en-CH` formatting, enterprise modules, and license configuration
retain their existing behavior. The admin valuation-cache chart's widened
time/numeric formatter types are also compatible.

The app accepts v14's font, focus, and tooltip defaults alongside its explicit
themes. Before/after report captures cover positive and negative returns, empty
expenses, fully convertible and partial mixed-currency data, light/dark themes,
and 1280px/390px widths. Inspection confirmed the blue aggregate bars, visible
zero lines, changed label spacing/sector-label placement, correct aggregate
tooltip values, and no horizontal overflow. Application captures also cover
allocation/breakdown donut and bar modes, single-node gains/losses, history
area/bar/line combinations, account scopes, and monthly/yearly modes. The same
history scenarios were captured against Charts 13.3.1 for comparison. Manual
interaction checks confirmed legend toggling, navigator keyboard changes, All
range reset, hover tooltips, and cumulative rebasing to zero over a recent range
with no flows. Explicit range-button colors still match Mantine. The history
range-button DOM fallback remains necessary: v14 exposes no public active-button
selection option. E2E checks confirm monthly 1Y and yearly 5Y buttons are
active.

App typecheck, lint, formatting, all 1002 unit tests, the unchanged coverage
ratchet, production build, Storybook build and all 89 interaction tests, and all
48 application E2E tests passed. E2E uses a dedicated database and isolated
ports. Regression tests cover undefined aggregate data, negative/zero amounts,
aggregate clicks, ordinary-node drilldowns, and bigint/grouped zoom boundaries.
Browser diagnostics are retained with the chart E2E artifacts; no new AG Charts
option warnings or uncaught errors occurred. Existing trial-license warnings
remain visible. Build directive/deprecation warnings and server logs for aborted
requests also occur in the Charts 13 baseline. Production license credentials
were unavailable, so preserving the license setup is verified separately from
licensed-production rendering. The admin cache chart was typechecked; populated
Redis-cache rendering was not exercised in this local run.

Frozen-lockfile installation passed. The Charts update added no audit findings:
the original baseline had one high `deepmerge-ts` and one moderate `sprintf-js`
finding. Incorporating main's scoped Prisma security fix removes the high
finding; the final audit retains only the moderate `sprintf-js` finding above.
Node 24, Prisma 7, the Nitro pin, schema, and coverage baseline are unchanged.

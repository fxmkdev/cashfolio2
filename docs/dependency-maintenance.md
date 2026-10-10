# Dependency maintenance

The October 2026 refresh updates stable releases within the existing major
versions, plus Logto 4, Chromatic 18, and dotenv 18. Node runtime and typings
stay on 24; pnpm is now on stable 12.11.1. Package families such as Mantine,
React, Prisma, Storybook, AG Grid, AG Charts, and Vitest must be updated
together.

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
| AG Grid / AG Charts                      | 36.2.0 / 14.2.0          |
| Vitest / coverage / browser              | 5.0.3                    |
| TypeScript / typescript6 compatibility   | 7.0.2 / 6.0.2            |
| MSW                                      | 2.15.0                   |
| Logto / Chromatic / dotenv               | 4.0.0 / 18.11.0 / 18.0.6 |
| Redis / PostgreSQL driver                | 6.3.0 / 8.23.1           |
| Node runtime / typings                   | 24.21.0 / 24.19.1        |
| pnpm / Prettier                          | 12.11.1 / 3.9.9          |

MSW 3 and Prisma prereleases are deferred to separate migrations. Storybook uses
addon-vitest 10.6.1 with the Playwright browser provider 5.0.3. Vitest,
coverage, and browser packages are upgraded together to stable 5.0.3. See the
app's
[Nitro compatibility notes](../apps/cashfolio-app2/docs/deployment.md#nitro-version-pin)
before revisiting its beta pin or scoped H3 override.

The Storybook runner and its scoped Jest overrides are removed. Every existing
story remains included; unit coverage stays separate and its baseline is
unchanged.

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

As of 2026-10-10, after the scoped Prisma override and removal of the Storybook
runner, `pnpm audit` reports no findings. Runner removal eliminates the
previously reported moderate `sprintf-js` advisory.

The Docker release-migration payload now reads the same reviewed workspace
release-age, build-script, and security override policy. Its separate audit also
reports no findings; this fixes its previously reported two high and one
moderate findings through `deepmerge-ts` and `mysql2`.

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
release-age threshold. The policy and existing exceptions remain unchanged. The
subsequent AG Grid 36 migration is documented below; the app continues to use
standalone Charts, without integrated Grid chart modules.

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
remain visible. Build directive/deprecation warnings also occur in the Charts 13
baseline. Application E2E server logs include requests aborted during page
navigation; the stack traces originate in HTTP connection-close handlers,
without browser chart errors or failed tests. Production license credentials
were unavailable, so preserving the existing enterprise/trial behavior does not
verify licensed-production rendering. The admin cache chart was typechecked;
populated Redis-cache rendering was not exercised in this local run.

Frozen-lockfile installation passed. The Charts update added no audit findings:
the original baseline had one high `deepmerge-ts` and one moderate `sprintf-js`
finding. Incorporating main's scoped Prisma security fix removes the high
finding; the final audit retains only the moderate `sprintf-js` finding above.
Node 24, Prisma 7, the Nitro pin, schema, and coverage baseline are unchanged.

## AG Grid 36 migration

AG Grid Enterprise and React use `^36.2.0`, with Community and the new
`ag-stack` resolved to the same version. Version 36.2.0 was published on
2026-09-16 and meets pnpm 11's default 1440-minute release age. No release-age
exception was added. The migration follows the official
[AG Grid 36 guide](https://www.ag-grid.com/react-data-grid/upgrading-to-ag-grid-36/)
and the 36.1/36.2 guides.

Cashfolio uses standalone AG Charts, not Integrated Charts or grid sparklines.
The three direct Charts packages preserve main's `^14.2.0` baseline from the
separately merged Charts migration (#349). Grid's optional Charts dependencies
and `ag-charts-types` also resolve to 14.2.0, removing the old optional Charts
13 graph. No Charts application migration is duplicated here. A future
Integrated Charts feature would require registration of compatible Charts
modules. The Nitro pin, scoped H3 override, Prisma 7, Node 24 typings, and
coverage baseline remain unchanged.

The new DOM places pinned cells inside each row and uses a unified scrolling
viewport. E2E row locators target `.ag-grid-scrolling-container > .ag-row`;
pinned action and selection helpers stay scoped to the supplied row. The detail
grid's minimum-height override targets the new scrolling wrapper and container.
The transaction editor uses the 36.2 `tooltip` callback API. Development
validation keeps full console diagnostics with its diagnostic overlay disabled;
Storybook uses the application's selective module registration too.

Migration verification passed on Node 24.21.0 / pnpm 11.28.5: app typecheck,
lint, formatting, all 1002 unit tests, the unchanged coverage ratchet,
production build, Storybook build, all 93 Storybook tests, and frozen-lockfile
installation. The complete 51-test application E2E run includes the offscreen
ledger scroll-and-flash scenario and the Charts compatibility coverage merged
into main. Desktop/mobile light/dark screenshots and browser checks covered
pinned cells and totals without runtime errors. History and report E2E tests
verified the standalone charts. After incorporating the security fix merged into
main, audit reports one moderate (`sprintf-js`) finding, with no high or
critical findings.

An additional application development-mode smoke check was blocked by the
unchanged Vite configuration: TanStack Start requires `/@react-refresh`, but no
React Refresh plugin is configured. Production and built Storybook checks
passed. The optional Storybook development server also reported unresolved `@/`
aliases during dependency pre-bundling; its built version passed every
interaction test. These tooling issues are outside this Grid migration. Existing
Enterprise missing-license warnings remain; no licensing configuration was
changed.

## Vitest 5 migration

The unit and Storybook configs explicitly preserve `clearMocks: false`; reset
and restore defaults remain unchanged. File-based projects retain independent
Vite plugins, aliases, setup files, and test discovery rather than relying on
Vitest 5's changed inline-project inheritance default. Review hoisted mocks for
top-level placement and await asynchronous assertions; assertions and the
coverage baseline must not be weakened. Unit coverage still uses `coverage/`,
while Storybook uses `coverage-storybook/`. Browser failure artifacts now use
`.vitest/` and are uploaded by the existing CI artifact action.

MSW stays on 2.15.0. The application MSW 3 migration is explicitly deferred;
`@vitest/mocker@5.0.3` still declares the compatible MSW 2 peer range `^2.4.9`.

Vitest 5 reports the same covered-file, branch, and function inventory. It
counts four fewer total statements/lines across the generated Prisma namespace
and `unit-format.ts`. After rebasing onto the merged Storybook migration, the
2026-10-10 local Node 24.21.0 run passed all 1000 unit tests and covered all 256
files: statements 73.00% (6128/8394), branches 65.04% (3922/6030), functions 70.33%
(1425/2026), and lines 73.86% (5962/8072). The committed coverage baseline remains
unchanged and its ratchet passes; no exclusions or assertions were weakened.

## TypeScript 7 migration

App and CLI typechecks use TypeScript 7.0.2's native `tsc`. Both projects
install `@typescript/native` as an alias of `typescript@^7.0.2` and `typescript`
as an alias of `@typescript/typescript6@^6.0.2`, following Microsoft's
documented side-by-side arrangement. The compatibility package exposes `tsc6`
and the TypeScript 6 compiler API for ESLint, Storybook react-docgen-typescript,
and other tooling that imports `typescript`. Do not replace that API alias with
the native compiler package until those consumers support its API.

Verify `pnpm --filter cashfolio-app2 exec tsc --version` and
`pnpm --filter cli exec tsc --version` report 7.x, while importing `typescript`
reports 6.x. Use `tsc6` for compatibility comparisons; it must not replace the
native typecheck commands. Native compiler platform packages must remain in the
lockfile for macOS development and Linux Docker/CI builds.

## pnpm 12 migration

The workspace pins stable pnpm 12.11.1 in packageManager (with registry SHA-512
integrity), engines, and the Docker migration-tools stage. Published on October 9
at 12:22 UTC, it passed the one-day release-age threshold when rechecked on
October 10 before the final review. pnpm 12.11.2 remains too young. The existing
one-day policy is now explicit as
`minimumReleaseAge: 1440`; retain the narrow `@fxmk/releaser@0.5.6` exception
and the reviewed `allowBuilds` entries.

The stable default installation mode is retained. Review pnpm 12's workspace
setting validation, engine enforcement, cyclic peer resolution, platform binary
installation, and Corepack bootstrap when changing these files. Existing
lockfiles remain supported, but re-resolution can rewrite cyclic peer variants.
Use `--frozen-lockfile` without a boolean argument and `--no-frozen-lockfile`
when explicitly disabling it. Verify both workspace and filtered Docker
installation; do not broadly enable dependency build scripts.

The 12.11 release adds dependency permissions and approved agent-skill links.
Cashfolio retains its existing `allowBuilds` policy; no broader permissions,
agent-skill approvals, Rust toolchain management, or experimental linker modes
are enabled. The existing Node 24 runtime pin remains locked during resolution.

The lockfile adds a separate pnpm/platform-binary document. The application lock
document remains byte-for-byte identical to the validated TypeScript stage; no
application dependency versions changed during the package-manager migration.
Repeat resolution and frozen installation must preserve this result. See the
[official pnpm 12 migration differences](https://pnpm.io/blog/whats-different-in-pnpm-12)
and
[pnpm 12.11.0 release notes](https://github.com/pnpm/pnpm/releases/tag/v12.11.0), and
[pnpm 12.11.1 patch notes](https://github.com/pnpm/pnpm/releases/tag/v12.11.1).

## Tooling migration verification

The rebased stack preserves all 89 original story IDs plus main's four Grid
stories. Current main's statement-import changes leave 1000 unit tests and 51
application E2E tests. All 1000 unit tests, 93 Storybook render/interaction
tests (including a separate coverage run), 51 E2E tests, and 11 CLI tests
passed. Prisma generation, app/CLI native typechecks, TypeScript 6 compatibility
comparisons, app lint/format, workflow lint, production and Storybook builds,
CLI startup help, and frozen-lockfile installation passed. The unit coverage
baseline is unchanged and its ratchet passes; Storybook coverage remains in a
separate directory. Desktop 1280x900 and mobile 390x844 browser dimensions,
per-story storage isolation, and awaited router initialization are asserted. The
scrolling Grid fixture is wider than the desktop viewport so its existing
horizontal-scroll assertion exercises overflow at both sizes.

Docker verification covers filtered frozen installation, the Linux native
compiler, Prisma schema validation, release migrations against a dedicated local
test database, and an HTTP 200 response from the generated production server.
Both workspace and separate migration-payload audits report zero findings.
Outdated checks still list intentionally excluded newer Node/typing, MSW, Prisma
prerelease, and Nitro beta lines, plus unrelated Chromatic updates; these are
not refreshed by this migration.

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
| AG Grid / AG Charts                      | 35.3.1 / 13.3.1          |
| Vitest / coverage                        | 4.1.11                   |
| MSW                                      | 2.15.0                   |
| Logto / Chromatic / dotenv               | 4.0.0 / 18.11.0 / 18.0.6 |
| Redis / PostgreSQL driver                | 6.3.0 / 8.23.1           |
| Node runtime / typings                   | 24.21.0 / 24.19.1        |
| pnpm / Prettier                          | 11.28.5 / 3.9.9          |

TypeScript 7, Vitest 5, MSW 3, AG Grid 36, AG Charts 14, pnpm 12, and Prisma
prereleases are deferred to separate migrations. Keep the exact Storybook
test-runner pin. See the app's
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

## Remaining audit findings

As of 2026-10-09, `pnpm audit` reports one high and one moderate finding, with
no critical findings, down from 112 findings before the refresh:

| Dependency           | Path                                                        | Severity | Follow-up                                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deepmerge-ts@7.1.5` | Prisma 7 configuration, including release migration tooling | High     | The [recursive merge advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) is fixed in major version 8. Update through a compatible Prisma release or assess that transitive major migration separately. |
| `sprintf-js@1.0.3`   | Storybook test-runner's Jest dependencies                   | Moderate | The [precision-specifier advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) has no published patched version. Revisit when a fix or compatible upstream replacement is available.                     |

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

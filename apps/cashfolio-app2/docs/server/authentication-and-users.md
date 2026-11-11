# Authentication and Users

Scope: `apps/cashfolio-app2`; source paths are relative to that app.

[Server functions](../server-functions.md) ·
[Architecture and ownership](../architecture.md)

## Authentication sessions

### HTTP response caching

The server entry point sets `Cache-Control: no-store` on all dynamic redirects
(301, 302, 303, 307, and 308), all home (`/`) responses, and all `/api/logto/`
responses, including errors and early request-validation failures. This prevents
browsers from replaying an outdated authentication decision or a one-time
authorization URL. Other responses retain their cache policy; static asset
serving is unchanged.

After deployment, affected browsers may need to clear cached files for
`cashfolio.app` and `auth.cashfolio.app` once: new response headers cannot
invalidate redirects the browser reuses without contacting the server. Logto
Cloud controls caching on its own origin, including its consent redirect; the
Cashfolio response policy does not change those headers.

### Session storage

Production authentication uses PostgreSQL-backed sessions, independent of Redis.
The `__Host-cashfolio-session` cookie contains a random 256-bit bearer and uses
Secure, HttpOnly, SameSite=Lax, and Path=/. Only its SHA-256 hash is stored in
`AuthSession`; Logto state and credentials are encrypted with `SESSION_SECRET`.
Legacy `logtoCookies` values are never accepted as authentication credentials.

Sign-in creates ten-minute anonymous state. The SDK validates callback state,
PKCE, and the signed ID token before the callback creates/finds the application
user and rotates the bearer into a new authenticated session. Application
requests look up existing users rather than recreating missing records. The
isolated E2E build always uses synthetic authentication and test-user
provisioning.

Callback provisioning and deletion reservation share a PostgreSQL advisory lock
per hashed subject. Reservation writes an `AuthSubjectRevocation` marker after
authorization and final-admin checks, in the same transaction as the pending
flag. Callbacks check that durable marker before an atomic conflict-safe user
insert (`createMany` with `skipDuplicates`). A callback with an already
exchanged code cannot recreate a deleted user even when its anonymous session
survives the user/session cascade. Different first-time sessions can provision
the same subject without retrying consumed authorization codes.

Every authenticated lookup checks the session's fourteen-day absolute deadline,
twenty-four-hour idle deadline, and owning user. Successful requests advance
only the idle deadline, bounded by the original absolute deadline. Expired ID
tokens force the SDK to refresh rather than reuse cached access tokens; ordinary
access requires fresh, unexpired ID claims and a usable access token. Invalid
refresh credentials revoke the session. Provider outages fail closed with a
retryable 503, and database failures never fall back to cookies or Redis.

If exchange rotates a refresh credential before a temporary JWKS failure, the
transaction preserves only that replacement refresh token alongside the previous
ID token and removes cached access tokens. It commits before the caller receives
503, without extending either deadline. Unverified replacement ID/access tokens
are never stored or used for access. The next request must refresh and verify
again. Definitive token-validation failures still revoke the session. Successful
verified credentials commit before downstream Account API work, so a later
network failure cannot roll them back. The locked authentication phase captures
the access-token string before saving credentials; only that string and verified
context leave the transaction. Downstream HTTP work cannot call the SDK or
refresh after lock release. If the captured token expires during commit, the
upstream response follows the existing API error handling; a later application
request can refresh under the lock. Deletion-only sessions carry no access
token. Database failure after token consumption cannot guarantee durable
recovery and may require a fresh sign-in.

SDK refresh and persistence run under a transaction-scoped PostgreSQL advisory
lock per bearer hash, shared across Machines. Conditional updates cannot
recreate deleted sessions or renew expired ones. These transactions are not
retried, because an external refresh may already have consumed a rotating token.
SDK requests have five-second timeouts; transactions have a thirty-second
timeout and ten-second lock timeout. Logout commits local revocation before
clearing the cookie or attempting remote sign-out. Database revocation failure
preserves the cookie for retry; provider failure after revocation cannot undo
local logout.

`deletionPending` immediately blocks ordinary access through every session. Only
deletion preview/retry helpers pass `allowDeletionPending: true`; they use the
still-valid server session as a deletion-only credential even if Logto cleanup
has already removed the identity. This path does not require provider refresh,
so partial cleanup remains retryable. Session absolute/idle deadlines still
apply. Successful user deletion removes all sessions through the user FK.
Sign-in redirects a still-valid pending-deletion session back to the deletion
page, preserving its retry capability when an ordinary route triggers sign-in.

## Auth and Authorization

- Logto integration uses `@logto/node` with `CookieStorage` in
  `src/auth/logto.server.ts`
- Logto Account API profile reads and updates are exposed through
  `src/server/user-profile.ts`; profile mutations enforce same-origin request
  checks before calling `PATCH /api/my-account`. User locale settings are stored
  on the app-owned `User` row.
- Self-service deletion is exposed at `/user/delete` for Logto Account Center.
  Configure integrations with this canonical URL. POST redirects to
  `/user/delete?deleted=1` after success and enforces authentication,
  same-origin checks, and final-Admin protection. The `POST` flow uses
  `src/server/user-deletion.ts` to delete the app-owned `User`, remove account
  books that would otherwise become inaccessible, clear book-scoped Redis period
  caches, and call Logto Management API `DELETE /api/users/{userId}` through
  `src/auth/logto-management.server.ts`. It requires
  `LOGTO_MANAGEMENT_API_ENDPOINT`, `LOGTO_MANAGEMENT_API_RESOURCE`,
  `LOGTO_MANAGEMENT_API_APP_ID`, and `LOGTO_MANAGEMENT_API_APP_SECRET`. The same
  Management API helper also reads `GET /api/users/{userId}` and uses batched
  `GET /api/users` exact-id searches for Admin user-table identity enrichment.
- User auth guard: `src/auth/functions.server.ts` (`ensureAuthenticated`) shares
  a non-redirecting `getAuthenticationContext` lookup with
  `getAuthenticationStatus` in `src/server/authentication.ts`. The GET status
  function returns only the session's authentication boolean, marks the response
  `no-store`, and requires no app-owned user or book records. The 404 page uses
  it after hydration to conditionally offer Sign Out; lookup failures leave that
  optional action hidden without replacing the 404 page.
- User upsert/lookup: `src/users/functions.server.ts`
- Admin user listing, current-user Admin capability checks, role management, and
  admin-triggered deletion of DB-backed users, including missing Logto
  identities: `src/server/admin-users.ts`
- Account-book authorization guard: `src/account-books/functions.server.ts`
  throws `notFound({ routeId: rootRouteId })` when the current user has no
  access link, covering both nonexistent and inaccessible books without
  revealing their existence. Router not-found signals are serializable and
  render the root 404 page when propagated through route loaders. Expected
  not-found signals are excluded from unexpected server-request error logs.
- All account/ledger/transaction server functions enforce account-book access
  before querying/updating data
- Same-origin request guard for mutation handlers lives in
  `src/security/same-origin.server.ts` and is applied to account and transaction
  `POST` server functions to reduce CSRF risk

## Dependency Security Note

- TanStack Start now references the patched `h3@2.0.1-rc.20` release, so the
  previous `h3-v2` override is no longer needed.
- Remaining dependency security overrides live in `pnpm-workspace.yaml`.

## Admin membership and user deletion

Application role changes and user-deletion reservations use
`src/server/admin-mutation.server.ts`. A global PostgreSQL transaction-scoped
advisory lock serializes these operations across users and app instances. Actor
authorization and the remaining-Admin count are re-read after the lock. The
transaction uses Read Committed isolation, a 25-second lock timeout, and the
existing database-only conflict retry. External API calls never run inside that
transaction or its automatic retry. Administrative SQL maintenance must preserve
the same invariant independently.

An active Admin has the `ADMIN` role and `deletionPending = false`. Role changes
reject pending targets; pending users cannot access Admin or authorize Admin
mutations. Self-demotion and Admin-triggered self-deletion remain prohibited.
Self-service deletion of the final Admin returns a readable `409` response
asking them to appoint another Admin first. Non-Admin deletion does not require
another Admin when the application has no Admin users.

Every deletion first commits `User.deletionPending = true` under the same guard.
The migration defaults existing users to false. Both Admin and Account Center
deletions then remove the Logto identity and remove application data. Only after
the database transaction commits do they perform best-effort book-cache cleanup,
using the IDs of books actually deleted. A failed Logto call or database cleanup
leaves the reservation intact: it is never automatically cleared after an
ambiguous failure. This prevents a user being counted as a remaining Admin after
their identity may already have been removed.

Deletion previews are advisory. Final application cleanup locks the target user
row before reading their current membership links, requires the reservation, and
locks the linked book rows in sorted ID order. It then deletes the user and
their links and deletes only those candidate books with no remaining members.
This also covers books linked after reservation and concurrent deletion of the
last members of a shared book. Row locks prevent membership inserts from racing
these decisions. Unrelated historical orphan books are never scanned or deleted.

Admin user-list responses include `deletionPending`. Pending rows display their
status, disable role editing, and offer **Retry Deletion**. Admins can retry
with the existing confirmation flow (external ID when Logto reports a missing
user). Logto `404` and repeated database deletion are idempotent. Self-service
retries remain available while the identity/session is usable; otherwise another
active Admin finishes deletion from the pending row. No background worker or
automatic privilege restoration is introduced.

# Server Functions

Server implementation guidance for `apps/cashfolio-app2`. Paths in topic pages
are relative to the app directory.

Start with the [architecture and ownership map](architecture.md) and
[module boundaries](module-boundaries.md) when choosing an implementation owner.

## Topics

- [Authentication and Users](server/authentication-and-users.md)
- [Server Request and Calculation Boundaries](server/request-boundaries.md)
- [Account and Transaction Mutations](server/account-mutations.md)
- [Reporting](server/reporting.md)
- [Holdings and Gain/Loss](server/holdings-and-gain-loss.md)
- [Period Caching](server/caching.md)

Related: [resource limits](resource-limits.md),
[valuation caching](valuation-caching.md), and
[reference balances](valuation-reference-balances.md).

## Section Links

Existing section URLs remain available below; detailed guidance lives in the
topic pages.

- <a id="authentication-sessions"></a>[Authentication sessions](server/authentication-and-users.md#authentication-sessions)
- <a id="server-function-pattern"></a>[Server Function Pattern](server/request-boundaries.md#server-function-pattern)
- <a id="read-request-validation"></a>[Read request validation](server/request-boundaries.md#read-request-validation)
- <a id="native-collection-apis"></a>[Native Collection APIs](server/request-boundaries.md#native-collection-apis)
- <a id="core-modules"></a>[Core Modules](server/request-boundaries.md#core-modules)
- <a id="account-module-organization"></a>[Account Module Organization](server/account-mutations.md#account-module-organization)
- <a id="account-mutation-operations"></a>[Account Mutation Operations](server/account-mutations.md#account-mutation-operations)
- <a id="valuation-provider-adapters"></a>[Valuation Provider Adapters](server/request-boundaries.md#valuation-provider-adapters)
- <a id="period-module-organization"></a>[Period Module Organization](server/reporting.md#period-module-organization)
- <a id="holding-gainloss-engine"></a>[Holding Gain/Loss Engine](server/holdings-and-gain-loss.md#holding-gainloss-engine)
- <a id="concurrent-account-book-mutations"></a>[Concurrent Account-Book Mutations](server/account-mutations.md#concurrent-account-book-mutations)
- <a id="period-caches"></a>[Period Caches](server/caching.md#period-caches)
- <a id="defensive-cache-reads"></a>[Defensive cache reads](server/caching.md#defensive-cache-reads)
- <a id="auth-and-authorization"></a>[Auth and Authorization](server/authentication-and-users.md#auth-and-authorization)
- <a id="dependency-security-note"></a>[Dependency Security Note](server/authentication-and-users.md#dependency-security-note)
- <a id="account-status-actions"></a>[Account Status Actions](server/account-mutations.md#account-status-actions)
- <a id="hierarchy-organization"></a>[Hierarchy Organization](server/account-mutations.md#hierarchy-organization)
- <a id="period-overview-gainloss"></a>[Period Overview Gain/Loss](server/reporting.md#period-overview-gainloss)
- <a id="asset-class-gainloss-reporting"></a>[Asset-Class Gain/Loss Reporting](server/reporting.md#asset-class-gainloss-reporting)
- <a id="gainloss-reconciliation-explain-fields"></a>[Gain/Loss Reconciliation Explain Fields](server/reporting.md#gainloss-reconciliation-explain-fields)
- <a id="period-warning-surface"></a>[Period Warning Surface](server/reporting.md#period-warning-surface)
- <a id="monetary-calculation-boundaries"></a>[Monetary calculation boundaries](server/request-boundaries.md#monetary-calculation-boundaries)
- <a id="bulk-transaction-mutations"></a>[Bulk Transaction Mutations](server/account-mutations.md#bulk-transaction-mutations)
- <a id="reporting-data-loading-boundary"></a>[Reporting data-loading boundary](server/reporting.md#reporting-data-loading-boundary)
- <a id="admin-membership-and-user-deletion"></a>[Admin membership and user deletion](server/authentication-and-users.md#admin-membership-and-user-deletion)
- <a id="accumulated-account-gainloss"></a>[Accumulated Account Gain/Loss](server/holdings-and-gain-loss.md#accumulated-account-gainloss)
- <a id="accounts-list-accumulated-gl-summary-cache"></a>[Accounts-list accumulated G/L summary cache](server/holdings-and-gain-loss.md#accounts-list-accumulated-gl-summary-cache)
- <a id="recorded-gl-in-since-start-summaries"></a>[Recorded G/L in Since-Start Summaries](server/holdings-and-gain-loss.md#recorded-gl-in-since-start-summaries)
- <a id="accumulated-gl-historical-basis-cache"></a>[Accumulated G/L historical basis cache](server/holdings-and-gain-loss.md#accumulated-gl-historical-basis-cache)
- <a id="balance-based-asset-and-liability-reporting"></a>[Balance-based Asset and Liability Reporting](server/reporting.md#balance-based-asset-and-liability-reporting)
- <a id="unified-account-management-queries"></a>[Unified account management queries](server/account-mutations.md#unified-account-management-queries)

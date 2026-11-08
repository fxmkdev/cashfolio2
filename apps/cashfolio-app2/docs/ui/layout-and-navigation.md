# Layout, Navigation, and UI Ownership

Scope: `apps/cashfolio-app2`; source paths are relative to that app.

[UI patterns](../ui-patterns.md) ·
[Architecture and ownership](../architecture.md)

## Shared Contract Ownership

See [module ownership and import boundaries](../module-boundaries.md) for the
placement decision, shared domain groups, route privacy, and automated checks.

Cross-feature contracts belong in `src/shared/`, independent of UI components
and server implementations. Import `AccountOption` directly from
`src/shared/accounts/account-options.ts` in account selectors, transaction
editors, route controllers, and bulk-action helpers. The transaction-modal
modules retain compatibility type re-exports; editor-only `BookingValues` and
`TransactionFormValues` remain in the editor's types module.

Account-tree rows use `AccountTreeRow` from
`src/shared/accounts/account-tree.ts`. Public gain/loss response types, source
rows, pricing-source values, and diagnostic reasons live in
`src/shared/reporting/gain-loss-reconciliation.ts`. Shared helpers, UI
consumers, and server implementations import these contracts directly from their
shared owners. Existing server type exports remain as compatibility re-exports.
Money-based reconciliation inputs and calculation callbacks remain server
implementation details.

The Accounts grid adapts wire/projection `TreeRow` values to a client-only
`AccountsGridRow` discriminated union in
`src/components/account-management/grid/rows.ts`. `rowType` distinguishes
persisted accounts, persisted groups, synthetic headings, and the total footer.
Convert rows at the presentation boundary with `toAccountGridTreeRow`; server
payloads, IDs, hierarchy ordering, and expansion keys remain unchanged. Use
`isPersistedTreeRow`, `isPersistedAccountRow`, or `isPersistedGroupRow` before
edit/delete/child-creation actions, including callbacks from the shared
hierarchy editor. Mutation target builders accept only persisted variants.
Synthetic headings can retain group checkboxes for descendant selection, but
bulk targets include persisted account leaves only. Read-only projection helpers
can still consume source rows.

The architecture checks reject UI dependencies from shared/domain code,
route-private imports across owners, client bypasses of server facades, and
production imports of test/story support, including type-only dependencies. The
app lint command also rejects eager runtime cycles. See
[automated protection](../module-boundaries.md#automated-protection) for import
forms, test exemptions, and static-analysis limits.

Custom ESLint rules are TypeScript sources under `eslint-rules/`, included in
the app's strict typecheck. The ESLint config imports their `.ts` files
directly; Node 26 loads them through native type stripping without a build step
or custom loader. Use type-only imports for ESLint/AST types and erasable
TypeScript syntax so direct loading remains supported. Type stripping does not
check types; the normal `typecheck` command does.

## Shared Component Organization

Shared UI code lives under `src/components/`, grouped by the feature or UI
responsibility that owns it:

| Folder                | Responsibility                                                                |
| --------------------- | ----------------------------------------------------------------------------- |
| `account-editor/`     | Account/group editing, form values, and cash-flow inclusion form rules        |
| `account-management/` | Shared Accounts/Categories loading, controllers, presentation, and management |
| `account-tree/`       | Account/group tree selection and row actions                                  |
| `transaction-editor/` | Split transaction editing, booking columns, validation, and form state        |
| `transactions/`       | Simple transaction editing, rebooking, bulk actions, and dialog copy          |
| `grid/`               | DataGrid, column editors, filters, locale, and grid theme/CSS                 |
| `navigation/`         | Router link wrappers, breadcrumbs, navigation progress, and the user menu     |
| `layout/`             | Page shells, page headers, and shared sidebar dimensions                      |
| `period-filter/`      | Period-filter controls and explicit-period state shared across routes         |
| `dialogs/`            | Confirmations and shared mutation feedback                                    |
| `controls/`           | Number inputs, unit selectors, and split buttons                              |
| `testing/`            | Fixtures shared by component stories                                          |

Colocate tests and stories with their implementation. Import modules directly
from their owning folder; do not add root-level compatibility shims or general
component barrel files. Keep route-specific UI beside its owning route, and keep
existing Storybook titles and story export names stable when moving files.

Accounts and Categories use `account-management/` as their single implementation
owner. Their routes supply routing and navigation integration; pure search
helpers and common tab contracts remain in `src/shared/`. Shared feature modules
must not depend on either route's private implementation. Colocated story
fixtures can include route-shell decoration without making it a production
feature dependency.

Within `account-management/`, root modules compose the page, controller, and
feature contracts. Concern folders own the implementation:

| Folder         | Responsibility                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `loading/`     | Page loading/refresh, reference-balance requests, cancellation, and loading visibility                            |
| `grid/`        | Row models, hierarchy projections, summaries, presentation, columns/cells, filters, selection, and grid lifecycle |
| `dialogs/`     | Editor/confirmation state, prop assembly, and dialog components                                                   |
| `assignments/` | Assignment forms, frozen bulk targets, submission, and toolbar                                                    |
| `management/`  | Mutation payloads, management actions, organizer API, and guarded hierarchy callbacks                             |
| `gain-loss/`   | Gain/loss columns, header, and asset-class projection                                                             |

Import row contracts from `grid/rows.ts` and view contracts from `view-types.ts`
directly. Shared page/entity copy belongs in `labels.ts`. Tests, component
stories, and fixtures stay with their owner; the cross-feature story harness
stays in `stories/`. Folder names supply context, so implementation filenames
omit redundant account/page prefixes.

Organizer-aware editor submission and row moves live in `dialogs/organize.tsx`
and `dialogs/row-move.tsx`. The page header's CSS module is colocated as
`header.module.css`; cross-mode interaction stories stay in `stories/`.

## Page Loading

Use the global top progress bar for page-level loading, including client-side
work that continues after router navigation settles. Wrap the application in
`GlobalLoadingProvider` and call `useGlobalLoading(active)` from
`src/components/navigation/global-loading.tsx` with the page's pending state.
Keep it active across automatic retries and waits; set it false on success or an
actionable error. The hook releases its registration on unmount. Do not call
`nprogress.start()` or `complete()` directly from pages: one task finishing must
not hide another task's progress.

Avoid separate page-level spinners and pending status text. Preserve a page
heading during initial loading and existing complete content during refreshes
where appropriate. Keep actionable errors and retry controls in the page; these
are recovery UI, not loading indicators. Local action controls may still show
their own pending state to prevent duplicate submissions.

See [Global Navigation Progress](../routing.md#global-navigation-progress) for
router behavior, timing, and overlapping task handling.

## Mantine

- **Mantine 9** for general UI components, forms (`@mantine/form`), and theming
- **AG Grid Enterprise** wrapped in `src/components/grid/data-grid.tsx` with
  tree data support
- Use `LinkAnchor` from `src/components/navigation/link-anchor.tsx` for in-app
  links that should look like Mantine anchors. Avoid `Anchor` +
  `component={Link}` with casts.
- Use `LinkButton` from `src/components/navigation/link-button.tsx` when a
  navigation control should look like a Mantine button.
- Use `LinkTab` from `src/components/navigation/link-tab.tsx` for tab-like
  navigation that changes route/search state.

## Navigation Link Pattern

- If an element navigates to another page (including route-search state such as
  the category-management `tab`), render it as a TanStack link (an `<a>`), not
  as a button with an `onClick` navigation handler.
- Use:
  - `LinkAnchor` for text links/breadcrumbs
  - `LinkButton` for button-styled navigation actions (for example Accounts or
    Report)
  - `LinkTab` for route-driven tab navigation (for example Income/Expenses in
    Settings category management)
- Keep real `<Button onClick={...}>` controls for non-navigation actions only
  (submit, open modal, mutate data, etc.).
- For Mantine `Menu.Item` navigation, use a TanStack link wrapper based on
  `createLink(...)` so dropdown entries still render as real anchors.

## Shared Utilities (`src/shared/`)

`src/shared/accounts/account-utils.ts` contains pure utility functions used
across routes, components, and server functions:

| Function                                                        | Purpose                                                                                                                                                                          |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getTypeLabel(type, equityAccountSubtype)`                      | Human-readable label for an account type (e.g. `"Income"`, `"Asset"`)                                                                                                            |
| `isIncomeAccount(acct)`                                         | True when account is `EQUITY / INCOME`                                                                                                                                           |
| `isExpenseAccount(acct)`                                        | True when account is `EQUITY / EXPENSE`                                                                                                                                          |
| `getUnitIdentifier({ unit, currency, cryptocurrency, symbol })` | Canonical string key for a booking's unit (`"currency:CHF"`, `"crypto:BTC"`, `"security:AAPL"`)                                                                                  |
| `getSimpleTransactionUnitIdentifier({ ... })`                   | Canonical key for simple-flow account compatibility (`"currency:CHF"`, `"crypto:BTC"`, `"security:AAPL"`); for securities, `tradeCurrency` is still required as pricing metadata |

## Custom Hooks (`src/hooks/`)

Route-level logic that doesn't belong in components is extracted into hooks in
`src/hooks/`:

| Hook                   | File                         | Purpose                                                                   |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| `useExpandedGroups`    | `use-expanded-groups.ts`     | Persist/restore expanded group state via sessionStorage                   |
| `useTransactionScroll` | `use-transaction-scroll.ts`  | Scroll-to and flash a transaction row on the ledger grid                  |
| `useDialogSubmitState` | `use-dialog-submit-state.ts` | Reusable async-submit guard with in-flight state and optional parent sync |

## Route Page View Pattern

Route files in `src/routes/` should act as orchestration containers and keep
render trees in extracted `*PageView` components.

- Route containers keep:
  - `createFileRoute` config (`loader`, `validateSearch`)
  - route hooks (`Route.useLoaderData`, `Route.useParams`, route navigation)
  - server mutations and router invalidation
  - state/derived data orchestration
- Extracted view components keep:
  - route-visible JSX trees (headers, grids, modals, actions)
  - typed prop contracts for data and UI callbacks
- Controlled form views may receive a typed Mantine form, submission callback,
  pending/error state, locale, and header actions. Keep form state, validation,
  normalization, and submission guards in the route or its route-local
  controller; stories can reuse that controller with a submission fixture.
  Server calls, notifications, cache invalidation, and navigation remain wired
  by the route. Native POST forms retain their action and method in the view;
  request handlers stay in the route.
- Storybook:
  - create stories for each `*PageView` (happy path, empty/partial/modal states)
  - keep one lightweight route smoke story to validate router path/search/link
    integration

## Top Page Header Pattern

- Use `TopPageHeader` (`src/components/layout/top-page-header.tsx`) for
  page-level headers on account-book routes.
- Keep layout props centralized in `TopPageHeader`. The default layout uses
  `mb="lg"`, `justify="space-between"`, `align="center"`, `mih={36}`, and
  `flex="0 0 auto"`. Headers retain their full content height inside constrained
  page flex columns, including when actions wrap or have labels above their
  inputs.
- Pass heading content through `heading`, optional badges/chips through
  `headingAccessory`, and page actions through `actions`.
- An optional `description` slot places secondary metadata beneath the heading.
- Ledger pages opt into `layout="responsive"`; other callers keep the default
  layout. The responsive header uses its available container width, so changing
  sidebar width also changes the layout. At 80rem and wider, identity sits left
  and actions right, aligned at the top. Below 80rem, actions occupy a
  full-width second row. The ledger toolbar places the period selector left and
  commands right from 48rem to 80rem; below 48rem, the period selector, split
  button, and Add Transaction occupy separate full-width rows. The split
  button's dropdown segment stays compact. Names and metadata wrap without
  truncation.
- For hierarchical subpages, pass `PageBreadcrumbs`
  (`src/components/navigation/page-breadcrumbs.tsx`) as the `heading`.
- Breadcrumb parent items are links and the current page item is plain text. Do
  not duplicate breadcrumb navigation with a top-right back button.

### Ledger Account Switcher

Financial account ledgers use the account title and a compact chevron as one
**Switch Account** button inside the page heading. Display the account name
once, preserve heading typography, and let long names wrap. Category and system
ledgers retain plain headings.

The button opens a Mantine `Combobox` containing an autofocused **Search
Accounts** field and immediately visible hierarchical options. Render rows with
the public `TreeSelectOption` export so spacing, connector lines, chevrons,
hover states, and selection markers match form TreeSelect controls. Use public
`flattenTreeData` metadata to supply the row hierarchy and a small wrapper for
TreeSelect's line and spacing variables; do not copy row CSS or import private
Mantine files. This navigation control is an exception to the form-field
TreeSelect pattern. It follows the Accounts page's configured hierarchy and
sibling ordering within the current account book. Only active financial accounts
are destinations; omit archived accounts and groups without active account
descendants. Retain the real ancestor groups of active destinations. Groups
expand and collapse but cannot be selected. There is no archived-account option.

Each opening clears the search and reveals the current active account's branch
and siblings. When viewing an archived ledger directly, preserve its title,
offer active destinations without a selected option, and reveal the first active
account's branch. If none exist, show “No accounts found”. Search matches full
hierarchy paths, preserving ancestor context; slashes inside names remain
literal. Selecting an account opens its ledger and preserves the selected month,
year, or All Periods state, subject to existing account-book date bounds.
Transaction targeting and bulk selection are cleared. Normal browser history
returns to the previous ledger. Arrow Down from search highlights the current
account or first search result. Focus stays in search, with the highlighted
option exposed through `aria-activedescendant`. Up/Down browse options;
Left/Right navigate branches and Enter activates an account or toggles a group.
Selection, Escape, outside click, and the title button close the popover.
Dismissal restores focus to the title button. Keep the popover within the
viewport and its tree scrollable on narrow layouts.

## Document Title Pattern

- Use `createDocumentTitleHead` (`src/shared/navigation/document-title.ts`) from
  route `head` metadata for document titles.
- Match the page-specific document title to the visible page heading text. Use
  `Cashfolio` for routes without a page-specific title, otherwise use
  `<page title> · Cashfolio`.

## Narrow Page Shell Pattern

- Use `NarrowPageShell` (`src/components/layout/narrow-page-shell.tsx`) for
  simple form pages that should not span the full app content width.
- The default width is Mantine `Container` size `xs`, matching the account-book
  creation page. Keep the wrapper unframed; do not add card chrome unless the
  page needs a distinct contained surface.

## Split Button Pattern

- Use `SplitButton` (`src/components/controls/split-button.tsx`) when a
  page-level action has one primary command and a small set of related secondary
  commands.
- Keep the primary command on the main button and put secondary/destructive
  commands in the menu.
- Disabled menu items should remain visible with the normal action label; show
  the disabled-reason copy in a tooltip.
- Use `SplitButtonGroup` from the same module for compact multi-part page
  controls that need attached button segments without the primary/menu action
  shape.

## Session Storage for UI State

Expanded group IDs are persisted in sessionStorage with the key
`cashfolio:expandedGroups:${accountBookId}:${tab}`. This is encapsulated in
`useExpandedGroups` (`src/hooks/use-expanded-groups.ts`):

```ts
const { isGroupOpenByDefault, onRowGroupOpened } =
  useExpandedGroups(storageKey);
```

Pass the returned callbacks directly to the `DataGrid` props of the same names.

## Theme & Styling

- Theme config in `src/theme.ts`: `primaryColor: "blue"`, `defaultRadius: "md"`,
  `fontFamily: "Inter, sans-serif"`
- AG Grid theme in `src/components/grid/grid-theme.tsx` maps Mantine CSS
  variables to AG Grid theming
- PostCSS configured with `postcss-preset-mantine` and `postcss-simple-vars`

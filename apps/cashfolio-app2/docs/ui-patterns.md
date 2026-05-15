# UI Patterns

Scope: This document describes `apps/cashfolio-app2`. Unless noted otherwise,
paths are relative to that app directory.

## Mantine

- **Mantine 9** for all UI components, forms (`@mantine/form`), and theming
- **AG Grid Enterprise** wrapped in `src/components/data-grid.tsx` with tree
  data support
- Use `LinkAnchor` from `src/components/link-anchor.tsx` for in-app links that
  should look like Mantine anchors. Avoid `Anchor` + `component={Link}` with
  casts.
- Use `LinkButton` from `src/components/link-button.tsx` when a navigation
  control should look like a Mantine button.
- Use `LinkTab` from `src/components/link-tab.tsx` for tab-like navigation that
  changes route/search state.

## UI Copy

- Use Title Case for UI labels, including buttons, links, menu items, tabs,
  field labels, alert titles, placeholders, and accessible labels such as
  `aria-label`. Follow common product title-case rules: capitalize major words,
  and keep short articles, conjunctions, and prepositions lowercase unless they
  start or end the label.
- Use sentence case for full-sentence prose, helper text, validation errors,
  notifications, and explanatory empty states.
- Keep labels short and action-oriented. Prefer concise commands such as
  `Create New` over longer menu text when the surrounding context already names
  the object.

## Label Typography

- When a label combines a short code with a human-readable name, separate them
  with an en dash (`–`), not a hyphen-minus (`-`). Example: `CHF – Swiss Franc`.

## Navigation Link Pattern

- If an element navigates to another page (including route-search state such as
  the accounts list `tab`/`mode`), render it as a TanStack link (an `<a>`), not
  as a button with an `onClick` navigation handler.
- Use:
  - `LinkAnchor` for text links/breadcrumbs
  - `LinkButton` for button-styled navigation actions (for example "Period
    Report", "Archive", "Accounts")
  - `LinkTab` for route-driven tab navigation (for example Asset/Liability/etc.
    on the accounts list)
- Keep real `<Button onClick={...}>` controls for non-navigation actions only
  (submit, open modal, mutate data, etc.).
- For Mantine `Menu.Item` navigation, use a TanStack link wrapper based on
  `createLink(...)` so dropdown entries still render as real anchors.

## Shared Utilities (`src/shared/`)

`src/shared/account-utils.ts` contains pure utility functions used across
routes, components, and server functions:

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
- Storybook:
  - create stories for each `*PageView` (happy path, empty/partial/modal states)
  - keep one lightweight route smoke story to validate router path/search/link
    integration

## Modal Pattern

`EditAccountModal` and `EditAccountGroupModal` share these conventions:

- **`onExitTransitionEnd`**: used to defer clearing `initialValues` state until
  after the close animation, so the modal title stays stable ("Edit Account" not
  "New Account") while closing
- **`forceUpdate` reducer**: triggers a re-render after programmatic
  `setFieldValue` calls on uncontrolled forms

## Async Dialog Submission Pattern

All async dialogs should use `useDialogSubmitState` to provide predictable
submit UX and prevent duplicate requests.

- Use `runSubmit(async () => { ... })` in the submit path so button clicks and
  Enter-key submits share the same in-flight guard.
- While submitting:
  - primary action uses `loading` and `disabled`
  - cancel/secondary actions are disabled
  - modal closing is locked via `closeOnEscape={false}`,
    `closeOnClickOutside={false}`, `withCloseButton={false}`, and guarded
    `onClose`
- For dialogs rendered inside a parent-owned `<Modal>`, pass
  `onSubmittingChange` from the child form component so the parent can lock
  close behavior while the request is in flight.
- Confirm dialogs (`ConfirmDeleteModal`, `ConfirmArchiveModal`) should await
  async `onConfirm` handlers through the same guard pattern.

## Action Icons

- Always wrap `ActionIcon` components in a `Tooltip` describing the action (e.g.
  "Edit", "Delete")
- Action availability behavior is defined in `Action Availability Pattern`.
- Tooltip `openDelay` is configured globally in `src/theme.ts` (default 500ms) —
  do not override per-instance unless necessary

## Top Page Header Pattern

- Use `TopPageHeader` (`src/components/top-page-header.tsx`) for page-level
  headers on account-book routes.
- Keep layout props centralized in `TopPageHeader`: `mb="lg"`,
  `justify="space-between"`, `align="center"`, `mih={36}`.
- Pass heading content through `heading`, optional badges/chips through
  `headingAccessory`, and page actions through `actions`.

## Split Button Pattern

- Use `SplitButton` (`src/components/split-button.tsx`) when a page-level action
  has one primary command and a small set of related secondary commands.
- Keep the primary command on the main button and put secondary/destructive
  commands in the menu.
- Disabled menu items should remain visible with the normal action label; show
  the disabled-reason copy in a tooltip.
- Use `SplitButtonGroup` from the same module for compact multi-part page
  controls that need attached button segments without the primary/menu action
  shape.

## Breadcrumbs Pattern

- Use `getAccountsBreadcrumbSegments`
  (`src/components/accounts-breadcrumb-segments.tsx`) for the shared leading
  segments on account routes.
- Prefer `AccountPathHeading` (`src/components/account-path-heading.tsx`) when
  rendering account-route headings so breadcrumb typography stays aligned with
  `h2` titles.
- Use `LinkAnchor` for breadcrumb links; do not compose Mantine `Anchor` with
  router `Link` manually.
- Keep breadcrumb typography consistent by setting heading styles on
  `<Breadcrumbs ...>` and inheriting in children (`fz="inherit"`,
  `fw="inherit"`, `lh="inherit"`).
- Accounts page (`src/routes/$accountBookId/accounts.tsx`) shows a plain
  `<Title order={2}>Accounts</Title>` in active mode and breadcrumbs in archived
  mode.
- Archived accounts header renders `Accounts / Archive` with
  `archiveIsLink={false}` so the current segment is text, not a self-link.
- Ledger page (`src/routes/$accountBookId/$accountId.tsx`) renders: `Accounts`
  (and `Archive` when the account is archived), then account type, group path
  segments, then account name.
- Breadcrumb links should point to `/$accountBookId/accounts` and preserve the
  current `tab` and desired `mode` in route search params.

## Period Breakdown Drill-Down Pattern

- Period route (`src/routes/$accountBookId/period/route.tsx`) supports
  drill-down in:
  - Expense/Income charts (`Donut`, `Bar`)
  - Gains/Losses chart (`Waterfall`)
- Double-clicking a drillable chart node drills into its children.
- Account leaves (or any node without children) are informational and do not
  drill.
- In Gains/Losses table mode, only explicit account leaf rows
  (`explicit-account:*`) should navigate to the system-managed Gain/Loss equity
  ledger for the selected period.
- Keep the top-level explicit group row (`unit-type:explicit`) non-navigating so
  double-click can continue to expand/collapse that group.
- Keep drill state local to the page and scoped per card/type, preserving each
  side/path when toggling chart mode or breakdown side.
- Show an `Up` action and breadcrumb context (`All Expenses` / `All Income` /
  `All Gains/Losses` -> group path) directly above chart views.
- Persist Period card state in `sessionStorage`, scoped by `accountBookId`,
  including:
  - chart/table mode toggles
  - breakdown side toggles
  - per-card drill paths
  - table expand/collapse state
- Gains/Losses card persistence keys:
  - `selectedGainsLossesChartType` (`"waterfall"` by default, `"table"` when
    toggled)
  - `drillPathByGainsLosses` (node-id path for current chart drill level)
- Keep only the selected period (`period`) in route search params.
- Clamp stale drill paths to the nearest valid ancestor when refreshed data no
  longer contains a node.

## Accounts List Columns

- Non-equity tabs (`ASSET`, `LIABILITY`) render `Ccy.`, `Symbol`, `Balance`, and
  `Balance (<referenceCurrency>)`.
- `Balance` is account-level only (group rows are blank), with no aggregation.
- `Balance (<referenceCurrency>)` is account-level for leaf accounts across
  `Unit.CURRENCY`, `Unit.CRYPTOCURRENCY`, and `Unit.SECURITY` when a reference
  conversion is available (or the raw balance is 0), and shows aggregated
  descendant sums on group rows.
- Non-equity tabs render a pinned footer row with `Total` in
  `Balance (<referenceCurrency>)`.
- If any descendant account in a group has a blank
  `Balance (<referenceCurrency>)`, that group row stays blank in this column to
  avoid partial totals.
- The footer `Total` also stays blank when any account row in the tab has a
  blank `Balance (<referenceCurrency>)` value.
- Balances are displayed in each account's own unit/currency; no conversion.
- Liability balances are sign-adjusted for display (same direction as ledger
  display conventions).
- For right-aligned numeric columns, loading and placeholder content inside
  cells must also be right-aligned (for example dotted loaders in
  `Balance (<referenceCurrency>)` cells).

## Action Availability Pattern

- For each conditional action, provide both:
  - an availability boolean (e.g. `deletable`, `archivable`, `unarchivable`)
  - a disabled-reason string (e.g. `deleteDisabledReason`,
    `archiveDisabledReason`, `unarchiveDisabledReason`)
- In the UI, always render the action and wire availability to
  `ActionIcon.disabled`.
- The tooltip label should use the disabled reason when unavailable, otherwise a
  default action label.
- Enforce rules server-side as well; UI availability is an affordance, not an
  authorization check.

## Data Grid Actions Column

- Use `cellClass: "actions-cell"` so icons only appear on row hover (styled in
  `src/components/grid-theme.css`)
- Reuse this class in modal grids too (for example `EditTransactionModal`'s
  actions column) to keep action affordances consistent across the app
- Wrap multiple action icons in a
  `<Group gap={4} wrap="nowrap" h="100%" align="center">`
- If actions-column rendering grows beyond simple inline JSX, extract it into
  dedicated components under `src/components/` and keep the route focused on
  state/server orchestration

## Deletion Pattern

- Add `deletable` and `deleteDisabledReason` fields to data returned from the
  server
- Check constraints server-side before deleting (never trust client-side
  `deletable` alone)
- Use `<ConfirmDeleteModal>` (`src/components/confirm-delete-modal.tsx`) for
  delete confirmations — props: `opened`, `onClose`, `title`, `name` (the item
  being deleted), `onConfirm`

## Archive / Unarchive Pattern

- Add `archivable` and `archiveDisabledReason` fields to tree rows returned from
  `getAccountTreeData`
- Add `unarchivable` and `unarchiveDisabledReason` fields for archived-view
  actions
- Keep enforcement server-side:
  - account archive constraints in `archiveAccount`
  - group archive constraints in `archiveAccountGroup`
  - unarchive parent-chain constraints in `unarchiveAccount` and
    `unarchiveAccountGroup`
- Active view uses archive confirmation via `<ConfirmArchiveModal>`
  (`src/components/confirm-archive-modal.tsx`)
- Archived view triggers unarchive directly from the action icon (no
  confirmation modal)

## Type Descriptor Pattern

Account/group types are represented in form selects as composite strings:
`"ASSET" | "LIABILITY" | "EQUITY-INCOME" | "EQUITY-EXPENSE"`

`EQUITY-GAIN_LOSS` and `EQUITY-OPENING_BALANCES` are system-managed and are not
creation tabs.

The form's `transformValues` splits these into separate `type` and
`equityAccountSubtype` fields. The type is always derived from the currently
selected tab and the Type field is always disabled — it cannot be changed after
creation. The server enforces this by rejecting type changes on update.

## Ledger Page Pattern

The account ledger (`src/routes/$accountBookId/$accountId/index.tsx`) shows all
bookings for a single account in chronological order. The parent
`src/routes/$accountBookId/$accountId.tsx` route acts as a shared layout/loader
for ledger child routes.

- **Sign convention**: Values are negated for `LIABILITY` and `EQUITY`
  (non-`EXPENSE`) accounts so that balances display naturally (positive =
  increase)
- **Debit/Credit split**: Positive adjusted values → debit column, negative →
  credit column (shown as positive)
- **Debit/Credit column visibility**: Income accounts hide the debit column;
  Expense accounts hide the credit column; Equity (non-Expense) accounts hide
  the balance column
- **Running balance**: Accumulated across all bookings in chronological order
  (asset/liability period-filtered views are seeded from the pre-period all-time
  balance so displayed balances stay all-time)
- **Period filter**:
  - available for asset, liability, and non-opening-balance equity accounts
  - asset/liability bounds start at the account's first booking period (never
    before account-book start)
  - filtered asset/liability ledgers append a virtual `Balance carried forward`
    row when prior bookings exist
- **Counterparty names**: Derived from sibling bookings on the same transaction,
  deduplicated
- **Navigation**: Double-click an account row on the accounts list to open its
  ledger; back link returns to accounts list

## Activity Page Pattern

The activity page (`src/routes/$accountBookId/activity/index.tsx`) shows
individual bookings across the whole account book, newest first. It is not in a
single-account context.

- **Sign convention**: Uses raw booking values; positive values show in Debit
  and negative values show as positive amounts in Credit.
- **Columns**: Date, Account, Description, Ccy./Symbol, Debit/Credit in booking
  unit, Debit/Credit in reference currency, and row actions. No balance column.
- **Period filter**: Uses the same explicit month/year filter control as the
  account ledger, bounded by the account-book start date and today. Direct
  visits default to the current month so the page does not load the whole
  account book by accident.
- **Actions**: Add Transaction and Edit open the split transaction editor
  without a locked current account booking. Rebook excludes the clicked
  booking's current account.

## Validation Pattern

Shared validators live in `src/shared/account-validation.ts` and are used both
client-side (in Mantine form `validate`) and server-side (in server function
handlers).

- Per-field validators (e.g. `validateAccountName`) return an error message
  string or `null`
- Full-input validators (`validateAccountInput`, `validateAccountGroupInput`)
  throw on the first error
- **Duplicate name checking**: name validators accept an optional `siblingNames`
  parameter. The server queries sibling names before validation; the client
  derives them from `existingNodes` (the full tree data passed to modals)
- **Group-parent cycle prevention**: editing a group cannot set its parent to
  itself or any of its descendant groups. Enforce this both in modal validation
  and in `updateAccountGroup` server checks.

## Transaction Editing (EditTransactionModal)

`src/components/edit-transaction-modal.tsx` handles create/edit of transactions
with split bookings:

- **Debit/credit mutual exclusivity**: setting one clears the other
- **Current account booking**: locked (read-only) and non-deletable
- **Minimum bookings**: at least 2 bookings enforced
- **Date propagation**: date changes propagate to all bookings
- **Unit auto-population**: unit is auto-populated from selected account
  metadata
- **Booking row reordering**: enabled via AG Grid row drag in both create and
  edit flows

## Simple Transaction Creation / Editing

`src/components/simple-transaction-modal.tsx` handles quick creation and
eligible edit of two-booking transactions from the ledger route
(`src/routes/$accountBookId/$accountId.tsx`).

- Create entrypoint:
  - ledger toolbar exposes a single `Add Transaction` button
  - there is no separate `Add Split Transaction` toolbar button
  - users can switch one-way to split editor from the simple create dialog via
    `Switch to Split Editor`
  - switch carries over current simple-form draft values into split form

- Entry fields:
  - date, description, and amount (first row)
  - current account (read-only), direction toggle action icon, and counter
    account (second row)
- On transaction edit:
  - the row action remains a single `Edit` action
  - if the transaction is simple-edit eligible, the edit modal opens in simple
    mode first
  - users can switch one-way to split editor via `Switch to Split Editor`
  - switch carries over current simple-form draft values into split form
- Always creates exactly 2 bookings:
  - current account booking
  - selected counter account booking
- Both bookings must match the current account's unit identifier
- If the selected account is equity, the equity booking still receives the
  current account's unit fields
- If the selected account is asset/liability, each booking keeps its own account
  unit metadata (including security `tradeCurrency`)
- For equity account-type restrictions:
  - selecting an `INCOME` account forces `Debit` on the current account
  - selecting an `EXPENSE` account forces `Credit` on the current account
  - the direction toggle action icon is disabled while forced
- Availability:
  - only for current accounts of type `ASSET` or `LIABILITY`
  - current account must have a complete unit identifier
  - selected account must be active
  - `ASSET`/`LIABILITY` options must match the current account unit identifier
  - all active `EQUITY` accounts are available
  - for security units, compatibility is symbol-based (trade currency is not
    part of unit identity)
- Simple-edit eligibility (strict, lossless):
  - exactly 2 bookings
  - both bookings share the same unit identifier
  - both bookings share the same day
  - both booking descriptions are empty
  - exactly one booking belongs to the current ledger account
- Server-side validation re-checks all constraints before creation

### Conditional Editability Affordance

- Conditionally non-editable data cells use `cellClassRules` to apply
  `"ag-cell-disabled"` so users can see which fields are locked in the current
  row context
- `"ag-cell-disabled"` styling is intentionally subtle in
  `src/components/grid-theme.css` (`color: var(--mantine-color-dimmed)` and
  `cursor: not-allowed`)
- Do not apply this affordance to permanently non-editable columns
  (`editable: false`, e.g. status/col-span or actions columns)

### Account Type Debit/Credit Restrictions

- **Income** accounts may not have a positive (debit) value
- **Expense** accounts may not have a negative (credit) value
- Enforced both client-side in `EditTransactionModal` and server-side in
  `validateAccountTypeBookings()`

### Form Root Validation

- UI validation in `EditTransactionModal` requires all bookings to use the same
  unit
- UI validation requires debit/credit to balance (sum difference < 0.001)
- Server validation intentionally allows multi-unit transactions; it enforces
  sum-to-zero only when all bookings share the same unit identifier

### Unit Identifier Pattern

Bookings are grouped by a unit identifier string: `currency:${code}`,
`crypto:${symbol}`, or `security:${symbol}`.

In the UI transaction form, only one unit identifier is allowed per transaction.
Server-side validation intentionally allows multi-unit transactions and only
enforces sum-to-zero when all bookings share the same unit identifier.

The shared `getUnitIdentifier({ unit, currency, cryptocurrency, symbol })` in
`src/shared/account-utils.ts` produces these strings. Callers must guard that
`unit` is set before calling it.

For securities, unit identity intentionally uses only `symbol`. `tradeCurrency`
is required for pricing and valuation flows, but it does not define the booking
unit identity.

## AG Grid Column Types

Defined in `src/components/column-types.tsx`:

- `FORMATTED_NUMERIC_COLUMN` — right-aligned, `en-CH` locale number formatting
  with unit-aware display precision
- `SELECT_COLUMN` — searchable dropdown editor
- `TEXT_COLUMN` — text input editor
- `DATE_COLUMN` — date input with min/max constraints from context

## AG Grid Column Alignment

- Right-align date and numeric values to improve vertical scanning in ledger and
  modal grids.
- `DATE_COLUMN` and `FORMATTED_NUMERIC_COLUMN` include right-aligned header and
  cell classes by default.

## AG Grid Context Pattern

Grids pass a context object to cell renderers and editors containing helper
data, form references, and callbacks.

## AG Grid Column Filters

Columns use AG Grid's built-in filter UI (not URL search params):

- `filter: "agTextColumnFilter"` — text contains/starts-with filter
- `filter: "agNumberColumnFilter"` — numeric comparison filter
- `filter: true` — default filter for the column type
- `filter: false` — explicitly disable filtering on a column (e.g. actions
  column)

## AG Grid Theme Synchronization

`AgThemeModeSynchronizer` (in `__root.tsx`) listens to
`useComputedColorScheme()` and sets `data-ag-theme-mode` on `documentElement`.
The AG Grid Quartz theme responds to this attribute to switch between light and
dark mode. AG Grid theme config is in `src/components/grid-theme.tsx`.

## Sibling Reorder Pattern

- The main accounts tree does not use row dragging.
- Reorder action availability follows the generic `Action Availability Pattern`.
- Availability is based on sibling count under the same parent.
- Clicking the action opens `ReorderGroupChildrenModal`
  (`src/components/reorder-group-children-modal.tsx`) and shows all siblings
  (accounts and groups) of the clicked row.
- The modal uses a compact AG Grid with:
  - no header (`headerHeight={0}`)
  - one draggable name column
  - `rowDragManaged` for in-modal reordering
- This also supports root-level rows (no parent group), so root groups can be
  reordered.
- On row drag end, the modal sends updated sibling `sortOrder` values to
  `reorderAccountTreeItems`; the route then invalidates loader data.

## Node Type Mixing in Tree Data

The `getAccountTreeData` server function returns a single flat array where each
row has a `nodeType` field (`"account"` or `"accountGroup"`). AG Grid's tree
data groups them hierarchically. Fields that don't apply to a node type are
`null`.

## FormattedNumberInput

`src/components/formatted-number-input.tsx` wraps Mantine's `NumberInput` using
`Intl.NumberFormat` to extract locale-specific thousand/decimal separators
(defaults to `en-CH`).

Precision behavior:

- **Display contexts** enforce unit-aware precision via
  `src/shared/unit-format.ts`:
  - currencies: ISO 4217 minor units (with fallback to `2`)
  - cryptocurrencies: Kraken `display_decimals` (with fallback to `8`)
  - securities: `0` decimals
- **Data-entry contexts** do not enforce decimal caps, so users can enter and
  review full decimal precision from the stored numeric value.

## Session Storage for UI State

Expanded group IDs are persisted in sessionStorage with the key
`cashfolio:expandedGroups:${accountBookId}:${tab}`. This is encapsulated in
`useExpandedGroups` (`src/hooks/use-expanded-groups.ts`):

```ts
const { isGroupOpenByDefault, onRowGroupOpened } =
  useExpandedGroups(storageKey);
```

Pass the returned callbacks directly to the `DataGrid` props of the same names.

## Transaction Highlighting

The ledger supports a `transactionId` search param to auto-scroll to a
transaction, flash its cells, then clear the param from the URL. This is
encapsulated in `useTransactionScroll` (`src/hooks/use-transaction-scroll.ts`):

```ts
const { pendingScrollRef, handleRowDataUpdated } = useTransactionScroll(
  transactionId,
  navigate,
);
```

- `transactionId` comes from the route's search params; `navigate` comes from
  `Route.useNavigate()`
- Pass `handleRowDataUpdated` to the `DataGrid`'s `onRowDataUpdated` prop
- After creating or updating a transaction, set
  `pendingScrollRef.current = transactionId` before invalidating the router —
  this triggers the scroll/flash on the next data update
- Implementation: on `RowDataUpdated`, `ensureNodeVisible()` is called for all
  matching rows. After the scroll completes (via `bodyScrollEnd` or a double
  `requestAnimationFrame` fallback), `flashCells()` is called. The search param
  is cleared from the URL immediately to avoid re-triggering on re-renders.

## Theme & Styling

- Theme config in `src/theme.ts`: `primaryColor: "blue"`, `defaultRadius: "md"`,
  `fontFamily: "Inter, sans-serif"`
- AG Grid theme in `src/components/grid-theme.tsx` maps Mantine CSS variables to
  AG Grid theming
- PostCSS configured with `postcss-preset-mantine` and `postcss-simple-vars`

# Transactions and Statement Import

Scope: `apps/cashfolio-app2`; source paths are relative to that app.

[UI patterns](../ui-patterns.md) ·
[Architecture and ownership](../architecture.md)

## Ledger Page Pattern

The account ledger (`src/routes/$accountBookId/$accountId/index.tsx`) shows all
bookings for a single account in chronological order. The parent
`src/routes/$accountBookId/$accountId/index.tsx` route acts as a shared
layout/loader for ledger child routes.

- **Sign convention**: Asset and liability running balances retain their stored
  sign (positive = owned, negative = owed). Only `EQUITY` (non-`EXPENSE`)
  balances retain their existing display inversion.
- **Debit/Credit split**: Positive booking values → debit column, negative →
  credit column (shown as positive), independent of account type.
- **Debit/Credit column visibility**: Income accounts hide the debit column;
  Expense accounts hide the credit column; Equity (non-Expense) accounts hide
  the balance column
- **Reference-currency equity rows**: For equity ledgers, bookings in the
  account book reference currency leave `Ccy./Symbol` blank. When the ledger
  shows adjacent reference-currency Debit/Credit columns, the booking-unit
  Debit/Credit cells are also blank because those reference columns already
  carry the amount. Non-reference currency, crypto, and security bookings keep
  their native unit and native amount cells.
- **Running balance**: Accumulated across all bookings in chronological order
  (asset/liability period-filtered views are seeded from the pre-period all-time
  balance so displayed balances stay all-time)
- **Period filter**:
  - available for asset, liability, and non-opening-balance equity accounts
  - asset/liability bounds start at the account's first booking period (never
    before account-book start)
  - bounds extend through the account's latest booking date, so scheduled future
    bookings can be viewed without turning reports into projections
  - filtered asset/liability ledgers append a virtual `Balance carried forward`
    row when prior bookings exist
- **Counterparty names**: Derived from sibling bookings on the same transaction,
  deduplicated
- **Navigation**: Asset/liability ledgers highlight Accounts. Category and
  system ledgers leave primary navigation unselected and show a compact
  `Back to {source}` link when opened within the app. The source is captured in
  router history state from account/category grids, transaction/counterparty
  links, Report, History, and reconciliation. It preserves the source URL,
  period, and fragment without adding ledger query parameters or preferences.
  Opening another ledger captures the immediate source; same-ledger period and
  transaction-selection changes retain the original context. Reload and
  Back/Forward preserve context, while direct/new-tab visits without state omit
  the link. Return traverses to the source history entry, falling back to URL
  replacement when its index is unavailable.
- **Classification badges**: Income Category, Expense Category, System Account
  (Opening Balances), and System-Managed Category (Gain/Loss). Names remain user
  content. Editable income/expense ledgers offer Manage Category in their action
  menu, selecting the corresponding Settings tab and showing archived items when
  the category is archived. System-managed restrictions remain unchanged.

## Transactions Page Pattern

The transactions page (`src/routes/$accountBookId/transactions/route.tsx`) shows
one row per transaction across the whole account book, newest first. It is not
in a single-account context. Clicking an ordinary row cell or pressing Enter on
a focused ordinary cell opens a separate bookings grid in a bottom details
panel. Account links and bulk-selection checkboxes do not open details.

- **Transaction columns**: Date, Debit Account(s), Credit Account(s),
  Description, Ccy./Symbol, Amount, and Amount in reference currency. The Date
  is the earliest booking date in the transaction, and the reference amount is
  the larger absolute converted debit or credit side.
- **Booking columns**: Date, Account, Description, Ccy./Symbol, Debit/Credit in
  booking unit, Debit/Credit in reference currency, and booking actions. Detail
  booking rows intentionally show only the booking description; they do not fall
  back to the transaction description when the booking description is blank.
- **Sign convention**: Detail rows use raw booking values; positive values show
  in Debit and negative values show as positive amounts in Credit.
- **Period filter**: Uses the same explicit month/year filter control as the
  account ledger, bounded by the account-book start date and the latest booking
  date. Direct visits default to the current month. If any booking intersects
  the selected period, the page shows the complete transaction, including
  bookings outside that period.
- **Actions**: Add Transaction and Edit open the split transaction editor
  without a locked current account booking. The details header reuses the
  ledger's secondary `SplitButton` with `variant="default"`: Edit is the main
  action, and the Transaction actions menu contains Copy, a divider, then Delete
  in red. For opening balances, Edit is disabled and the menu remains available
  to show disabled Copy/Delete items with their explanatory tooltips. On mobile,
  the split button occupies a second row while Close stays at the upper right.
  Close is a neutral tertiary text button with the same 36px height and
  typography as Edit; its width follows its label. Rebook is a booking-level
  action in the details panel and excludes the clicked booking's current
  account.

- **Details layout**: The desktop panel has a fixed 320px height, including its
  header and bookings grid, capped at 50% of the available list area on short
  windows. A separate 10px (`xs`) gap divides it from the transaction list,
  which fills the remaining space. Both grids scroll independently, and the main
  grid stays mounted when details open, close or move to mobile. The header has
  10px vertical padding and no horizontal padding: its heading and Close button
  align with the bookings grid's outer edges. Date and booking count sit 2px
  below the heading. Headings wrap to at most two lines, or one when the panel
  is 256px tall or shorter, preserving usable space for booking rows and Rebook.
  The complete heading remains its accessible name and native hover title. Below
  the Mantine `sm` breakpoint, details use a full-screen bottom drawer with the
  same header alignment; the inspected transaction survives viewport changes.
- **Column sizing**: Both grids fit a 1470px viewport at 100% zoom with the
  sidebar expanded by default. Compact date, unit and numeric columns leave
  flexible account and description columns room to grow; headers wrap and adjust
  their height. Tooltips expose full text and formatted values. All columns,
  filters and manual resizing remain available; smaller viewports or enlarged
  columns may scroll horizontally. Booking widths survive transaction changes
  and reopening during the current visit.
- **Inspection state**: Inspection is independent of bulk checkbox selection and
  highlights its transaction row. Details derive from current loaded rows, so
  edits and rebooking refresh immediately. Switching transactions resets booking
  filters and scroll position while retaining column widths. Filtering out or
  deleting the inspected transaction, or changing book/period, closes details.
  Navigation and successful create/edit/rebook scroll targets open details too.
- **Keyboard and screen readers**: The grids are named `Transactions` and
  `Transaction bookings`. Desktop details are a named region without a focus
  trap. Ordinary cell clicks retain list focus and announce the inspected
  transaction; plain Enter moves focus to the details heading. The transaction
  grid references a screen-reader-only instruction explaining Enter activation
  and Space selection; no visible hint or dedicated details column is added.
  Links, action buttons, selection controls, and modified shortcuts retain their
  own behavior. Close returns focus to the originating transaction cell, using
  its transaction and column IDs rather than its row index. Navigation without
  an originating cell falls back to the transaction's Date cell; an unavailable
  transaction falls back to the main grid. The mobile drawer uses modal focus
  handling and supports Escape. Escape closes an open action menu before closing
  the mobile drawer. Mutation dialogs return focus to Edit or, for menu actions,
  the menu trigger; successful deletion retains the main-grid focus fallback.

Use Mantine components for generic controls and layouts. The details UI uses
`SplitButton`, `Drawer`, `ActionIcon`, `Tooltip`, `Button`, `Title`, `Text`,
`Group`, `Stack`, `Flex`, `Box`, and `VisuallyHidden`; its custom components
compose transaction behavior and the existing AG Grid wrappers.

## Bulk Transaction Actions

- Account ledgers support bulk Rebook and Delete; the Transactions page supports
  bulk Delete on master rows. Existing single-row actions remain available.
- Use AG Grid native `multiRow` checkbox selection, a left-pinned selection
  column, filtered header select-all, and no selection on ordinary cell clicks.
  Opening-balance transactions have disabled checkboxes with the management
  explanation; virtual carried-forward rows have no checkbox.
- Show a contextual toolbar above the grid with the selected booking/transaction
  count, action buttons, and Clear Selection. Selection survives sorting and
  ordinary refreshes, but excludes filtered-out or newly protected rows and
  clears when account, book, or period changes.
- Rebook snapshots selected bookings and offers a single target compatible with
  every booking. Delete snapshots unique transaction IDs and explicitly warns
  that all bookings, including those in other accounts, are permanently deleted.
- Dialog submission uses the async-submit guard and shared mutation feedback.
  Failure preserves the dialog snapshot and shows an inline error while
  refreshing current constraints; live selection is reconciled with selectable
  rows, and target choices update. Success clears selection, refreshes once, and
  reports the affected count. Bulk actions are atomic.
- Shared selection and action state lives in `useBulkTransactionActions`, with
  toolbar/dialog components in `bulk-transaction-actions.tsx`.

## Transaction Editing (EditTransactionModal)

`src/components/transaction-editor/edit-transaction-modal.tsx` is the public
entry point for creating/editing transactions with split bookings.

The public module keeps its component, props, and type exports stable. Its
implementation is grouped under `edit-transaction-modal/`: `controller.ts`
composes the form and grid owners and reports combined dirty state; `form.ts`
owns uncontrolled form initialization, date propagation, provisional date input,
and submission; `grid.ts` owns copied rows, columns, locking, and grid context;
`grid-events.ts` contains booking edits and row mutations; `view.tsx` renders
the existing controls. Field rules remain in the adjacent validation helper,
with the existing values, unit-defaults, and dirty-state helpers reused.
Submission stops active cell editing and waits for AG Grid's queued cell-change
handlers before validation reads the latest form values. Repeated submits share
the pending edit commit and retain the submission guard.

The editor preserves these behaviors:

- **Debit/credit mutual exclusivity**: setting one clears the other
- **Current account booking**: locked (read-only) and non-deletable
- **Minimum bookings**: at least 2 bookings enforced
- **Date propagation**: calendar-day changes propagate to all bookings;
  unrelated updates that clone a `Date` must not overwrite booking dates
- **Booking units and currencies**: selecting a balance account with a fixed
  unit uses that account's unit metadata. Selecting an equity account, including
  an income/expense category, preserves the booking's existing unit and
  associated metadata. Only bookings without a unit inherit the current-account
  booking's metadata. This rule applies to both ledger and statement-import
  editors. Equity accounts have no account-level unit metadata. Unit, currency,
  and security symbol remain editable for their bookings, so a category booking
  can use EUR while the current account uses CHF. Defaults do not convert
  amounts or require currencies to match. Existing units with incomplete
  metadata are preserved for validation rather than filled from another booking.
- **Booking row reordering**: enabled via AG Grid row drag in both create and
  edit flows
- **Dirty reporting**: optional `onDirtyChange` reports form and pending editor
  changes. Custom grid editors report provisional changes through
  `context.onCellEditorDirtyChange`; modal grid rows are copies so cell commits
  cannot mutate the form's initial-value snapshot.

`useUnsavedChangesGuard` combines a route-scoped TanStack Router blocker with
`beforeunload`. Its `requestConfirmation` also guards local discard actions,
using the same `confirm`/`cancel` handlers and confirmation dialog as
navigation. Scope blocking to the route owning the edits so destination loader
redirects can complete after the user confirms departure.

## Simple Transaction Creation / Editing

`src/components/transactions/simple-transaction-modal.tsx` handles quick
creation and eligible edit of two-booking transactions from the ledger route
(`src/routes/$accountBookId/$accountId/index.tsx`).

- Create entrypoint:
  - ledger toolbar exposes a single `Add Transaction` button
  - there is no separate `Add Split Transaction` toolbar button
  - users can switch one-way to split editor from the simple create dialog via
    `Switch to Split Editor`
  - switch carries over current simple-form draft values into split form
  - an unselected counter account/category stays empty in the second booking
    when switching to the split editor

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
  - only for current accounts of type `BALANCE`
  - current account must have a complete unit identifier
  - selected account must be active
  - `BALANCE` options must match the current account unit identifier
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

## Account Statement Import

The account ledger exposes `Import Statement` as the split button's main action
for asset and liability accounts with complete unit metadata and a configured
CSV format, including archived accounts. `Edit` is the first menu item. When
importing is unavailable, `Edit` remains the main action and `Import Statement`
stays in the menu, disabled with a reason tooltip. Income, expense, and
gain/loss categories omit the import action entirely and keep `Edit` as the main
action. The import action opens a dedicated import page. The v1 importer accepts
a strict CSV with a header row, but header names are ignored. The first six
columns must be ordered as: `date`, `amount`, `original amount`,
`original currency`, `exchange rate`, and `description`. Comma and semicolon
delimiters are supported, and extra trailing columns are ignored. The fifth
`exchange rate` column is reserved for source CSV compatibility but ignored by
the importer.

- Imported rows are virtual transaction drafts until the user confirms import.
- Modified statement reviews require confirmation before returning to Upload or
  navigating elsewhere, including browser Back/Forward. Reloading, closing the
  tab, or leaving the site uses the browser's native `beforeunload`
  confirmation. Untouched reviews and reviews restored to their uploaded values
  do not prompt. Unsaved changes in the imported-transaction editor, including
  active grid edits, are protected on page departure; closing or cancelling that
  editor still discards its changes directly. The guard stays active during
  import and after failure, and is disabled once the batch mutation succeeds.
  Drafts are not persisted, and browsers cannot guarantee `beforeunload` during
  forced termination or every mobile lifecycle event.
- CSV `amount` is signed from the current ledger account perspective: positive
  values debit the current account and negative values credit it.
- The current-account booking uses the ledger account unit. The counter booking
  starts as a currency booking using `original amount` and `original currency`
  when both are present. If they are blank, the counter booking uses the current
  account unit and the opposite `amount`.
- Drafts are reviewed in a separate grid on the import page, not directly in the
  ledger grid.
- The review grid freezes Checkbox, Status, Date, and Amount on the left and
  Balance on the right, immediately before the edit action, during horizontal
  scrolling. AG Grid automatically unpins columns when the viewport is too
  narrow to accommodate the frozen columns.
- The review grid shows a hypothetical account balance in the imported account's
  unit, calculated chronologically from a snapshot of all existing account-unit
  bookings fetched on upload plus the selected import candidates. Existing
  bookings count once, including those matched to ignored candidates. Selecting
  a matched candidate deliberately adds another transaction. Later bookings do
  not affect earlier row balances. Edits recalculate using each current-account
  booking's own UTC date and compatible unit; liability balances retain their
  signed values. The combined grid shows newest dates first, preserving CSV row
  order within each day (calculated bottom-to-top). Matched bookings occupy
  their CSV row's position; other existing same-day bookings precede the CSV
  sequence. A non-zero projected balance before the earliest review date appears
  in a virtual `Balance carried forward` row at the bottom. History is refreshed
  on upload rather than synchronized with concurrent account edits.
- Unmatched existing bookings within the inclusive range of current draft dates
  appear as read-only rows labelled `Existing · not in statement`, with date,
  signed amount, description, and projected balance. They have no checkbox or
  edit action, do not affect import counts, and are never submitted. Matched
  bookings remain represented by their CSV rows. Date edits update the visible
  range; earlier history contributes to the carried balance.
- The counter account is editable directly in the review grid. Full draft edits
  still use `EditTransactionModal`.
- Drafts with zero or multiple non-current-account bookings show a `Multiple`
  badge in the counter account cell and must be edited through the row action.
- Drafts can be ignored without removing them from the review grid. Ignored rows
  are greyed out, show an `Ignored` status, and are skipped during import. The
  review checkbox directly controls inclusion: checked rows are included and
  unchecked rows are ignored. On upload, existing bookings in the target account
  are matched by UTC day and exact signed amount in the account's unit, across
  the CSV date range regardless of the selected ledger period. Matching is
  one-to-one: each existing booking skips at most one CSV row. Exact
  descriptions are paired first, then remaining rows are paired in CSV order
  even if their descriptions differ. Matched drafts start unchecked and show
  `Already exists` with an explanatory tooltip; unmatched drafts start checked.
  Users can check matched rows to import them anyway. Matching runs once per
  upload; it is not rerun on submission. The header checkbox includes or ignores
  all draft rows; existing-booking and `Balance carried forward` rows have no
  checkbox. Included rows use normal styling without a selected-row background
  tint. Ignored drafts cannot be edited until their checkbox is checked again.
- The review grid's unlabeled checkbox column uses AG Grid's default compact
  width, native checkboxes, and mixed header state. The visible guidance reads
  `Check rows to include them in the import; uncheck to ignore them.` A normal
  checkbox click or Space establishes a range anchor with the resulting
  inclusion state. Shift-click or Shift+Space in the inclusion cell applies that
  state to the displayed draft range, inclusive, regardless of the endpoint's
  previous state. Rows outside the range, existing-booking rows, and the
  carried-forward balance are unaffected. Repeated ranges keep the same anchor
  and do not restore earlier changes when shortened. Without a valid anchor,
  Shift toggles only the endpoint. File changes, header/select-all actions, and
  sorting/filtering clear the anchor; draft edits, keyboard activation of row
  actions, and API synchronization retain it. Inclusion is locked while import
  or draft-edit submission is in progress.
- Import uses a batch server mutation so either all reviewed drafts are created
  or none are.
- Imported drafts follow the shared
  [booking unit and currency rules](#transaction-editing-edittransactionmodal).
  Selecting a counter category preserves the imported original currency; newly
  added bookings without a unit inherit the current-account booking's metadata.
  Category booking units and currencies remain editable.

### Conditional Editability Affordance

- Conditionally non-editable data cells use `cellClassRules` to apply
  `"ag-cell-disabled"` so users can see which fields are locked in the current
  row context
- `"ag-cell-disabled"` styling is intentionally subtle in
  `src/components/grid/grid-theme.css` (`color: var(--mantine-color-dimmed)` and
  `cursor: not-allowed`)
- Do not apply this affordance to permanently non-editable columns
  (`editable: false`, e.g. status/col-span or actions columns)

### Account Type Debit/Credit Restrictions

- **Income** accounts may not have a positive (debit) value
- **Expense** accounts may not have a negative (credit) value
- Enforced both client-side in `EditTransactionModal` and server-side in
  `validateAccountTypeBookings()`

### Form Root Validation

- Both `EditTransactionModal` and server validation allow multi-unit
  transactions. Debits and credits must balance exactly only when all bookings
  share the same unit identifier.

### Unit Identifier Pattern

Bookings are grouped by a unit identifier string: `currency:${code}`,
`crypto:${symbol}`, or `security:${symbol}`.

Both the split transaction editor and server validation allow multiple unit
identifiers per transaction. They enforce an exact sum of zero only when all
bookings share the same unit identifier; amounts in different units are not
summed for balancing.

The shared `getUnitIdentifier({ unit, currency, cryptocurrency, symbol })` in
`src/shared/accounts/account-utils.ts` produces these strings. Callers must
guard that `unit` is set before calling it.

For securities, unit identity intentionally uses only `symbol`. `tradeCurrency`
is required for pricing and valuation flows, but it does not define the booking
unit identity.

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

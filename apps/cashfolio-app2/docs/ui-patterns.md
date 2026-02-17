# UI Patterns

## Mantine

- **Mantine 8** for all UI components, forms (`@mantine/form`), and theming
- **AG Grid Enterprise** wrapped in `src/components/data-grid.tsx` with tree
  data support

## Shared Utilities (`src/shared/`)

`src/shared/account-utils.ts` contains pure utility functions used across
routes, components, and server functions:

| Function                                                        | Purpose                                                                                         |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `getTypeLabel(type, equityAccountSubtype)`                      | Human-readable label for an account type (e.g. `"Income"`, `"Asset"`)                           |
| `isIncomeAccount(acct)`                                         | True when account is `EQUITY / INCOME`                                                          |
| `isExpenseAccount(acct)`                                        | True when account is `EQUITY / EXPENSE`                                                         |
| `getUnitIdentifier({ unit, currency, cryptocurrency, symbol })` | Canonical string key for a booking's unit (`"currency:CHF"`, `"crypto:BTC"`, `"security:AAPL"`) |

## Custom Hooks (`src/hooks/`)

Route-level logic that doesn't belong in components is extracted into hooks in
`src/hooks/`:

| Hook                   | File                        | Purpose                                                  |
| ---------------------- | --------------------------- | -------------------------------------------------------- |
| `useExpandedGroups`    | `use-expanded-groups.ts`    | Persist/restore expanded group state via sessionStorage  |
| `useTransactionScroll` | `use-transaction-scroll.ts` | Scroll-to and flash a transaction row on the ledger grid |

## Modal Pattern

`EditAccountModal` and `EditAccountGroupModal` share these conventions:

- **`onExitTransitionEnd`**: used to defer clearing `initialValues` state until
  after the close animation, so the modal title stays stable ("Edit Account" not
  "New Account") while closing
- **`forceUpdate` reducer**: triggers a re-render after programmatic
  `setFieldValue` calls on uncontrolled forms

## Action Icons

- Always wrap `ActionIcon` components in a `Tooltip` describing the action (e.g.
  "Edit", "Delete")
- When an action is disabled, the tooltip should explain why (e.g. "Cannot
  delete account because it has bookings")
- Tooltip `openDelay` is configured globally in `src/theme.ts` (default 500ms) —
  do not override per-instance unless necessary

## Data Grid Actions Column

- Use `cellClass: "actions-cell"` so icons only appear on row hover (styled in
  `src/components/grid-theme.css`)
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
- Keep tooltips on status actions; disabled status actions must explain why

## Type Descriptor Pattern

Account/group types are represented in form selects as composite strings:
`"ASSET" | "LIABILITY" | "EQUITY-INCOME" | "EQUITY-EXPENSE" | "EQUITY-GAIN_LOSS"`

The form's `transformValues` splits these into separate `type` and
`equityAccountSubtype` fields. The type is always derived from the currently
selected tab and the Type field is always disabled — it cannot be changed after
creation. The server enforces this by rejecting type changes on update.

## Ledger Page Pattern

The account ledger (`src/routes/$accountBookId/$accountId.tsx`) shows all
bookings for a single account in chronological order.

- **Sign convention**: Values are negated for `LIABILITY` and `EQUITY`
  (non-`EXPENSE`) accounts so that balances display naturally (positive =
  increase)
- **Debit/Credit split**: Positive adjusted values → debit column, negative →
  credit column (shown as positive)
- **Debit/Credit column visibility**: Income accounts hide the debit column;
  Expense accounts hide the credit column; Equity (non-Expense) accounts hide
  the balance column
- **Running balance**: Accumulated across all bookings in chronological order
- **Counterparty names**: Derived from sibling bookings on the same transaction,
  deduplicated
- **Navigation**: Double-click an account row on the accounts list to open its
  ledger; back link returns to accounts list

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

## Transaction Editing (EditTransactionModal)

`src/components/edit-transaction-modal.tsx` handles create/edit of transactions
with split bookings:

- **Debit/credit mutual exclusivity**: setting one clears the other
- **Current account booking**: locked (read-only), always first in the list
- **Minimum bookings**: at least 2 bookings enforced
- **Date propagation**: date changes propagate to all bookings
- **Unit auto-population**: unit is auto-populated from selected account
  metadata

### Account Type Debit/Credit Restrictions

- **Income** accounts may not have a positive (debit) value
- **Expense** accounts may not have a negative (credit) value
- Enforced both client-side in `EditTransactionModal` and server-side in
  `validateAccountTypeBookings()`

### Form Root Validation

- All bookings must have the same unit
- Debit/credit must balance (sum difference < 0.001)

### Unit Identifier Pattern

Bookings are grouped by a unit identifier string: `currency:${code}`,
`crypto:${symbol}`, or `security:${symbol}`. Only one unit identifier is allowed
per transaction.

The shared `getUnitIdentifier({ unit, currency, cryptocurrency, symbol })` in
`src/shared/account-utils.ts` produces these strings. Callers must guard that
`unit` is set before calling it.

## AG Grid Column Types

Defined in `src/components/column-types.tsx`:

- `FORMATTED_NUMERIC_COLUMN` — right-aligned, `en-CH` locale number formatting
- `SELECT_COLUMN` — searchable dropdown editor
- `TEXT_COLUMN` — text input editor
- `DATE_COLUMN` — date input with min/max constraints from context

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
- Active account and group rows expose a reorder action icon in the actions
  column only when the row has at least one sibling (same parent).
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
(defaults to `en-CH`). Used in `FORMATTED_NUMERIC_COLUMN` and
`EditTransactionModal`.

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

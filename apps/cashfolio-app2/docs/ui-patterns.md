# UI Patterns

## Mantine

- **Mantine 8** for all UI components, forms (`@mantine/form`), and theming
- **AG Grid Enterprise** wrapped in `src/components/data-grid.tsx` with tree data support

## Modal Pattern

`EditAccountModal` and `EditAccountGroupModal` share these conventions:

- **`onExitTransitionEnd`**: used to defer clearing `initialValues` state until after the close animation, so the modal title stays stable ("Edit Account" not "New Account") while closing
- **`forceUpdate` reducer**: triggers a re-render after programmatic `setFieldValue` calls on uncontrolled forms

## Action Icons

- Always wrap `ActionIcon` components in a `Tooltip` describing the action (e.g. "Edit", "Delete")
- When an action is disabled, the tooltip should explain why (e.g. "Cannot delete account because it has bookings")
- Tooltip `openDelay` is configured globally in `src/theme.ts` (default 500ms) — do not override per-instance unless necessary

## Data Grid Actions Column

- Use `cellClass: "actions-cell"` so icons only appear on row hover (styled in `src/components/grid-theme.css`)
- Wrap multiple action icons in a `<Group gap={4} wrap="nowrap" h="100%" align="center">`

## Deletion Pattern

- Add `deletable` and `deleteDisabledReason` fields to data returned from the server
- Check constraints server-side before deleting (never trust client-side `deletable` alone)
- Use a confirmation `Modal` before performing destructive actions

## Type Descriptor Pattern

Account/group types are represented in form selects as composite strings:
`"ASSET" | "LIABILITY" | "EQUITY-INCOME" | "EQUITY-EXPENSE" | "EQUITY-GAIN_LOSS"`

The form's `transformValues` splits these into separate `type` and `equityAccountSubtype` fields. The type is always derived from the currently selected tab and the Type field is always disabled — it cannot be changed after creation. The server enforces this by rejecting type changes on update.

## Ledger Page Pattern

The account ledger (`src/routes/$accountBookId/$accountId.tsx`) shows all bookings for a single account in chronological order.

- **Sign convention**: Values are negated for `LIABILITY` and `EQUITY` (non-`EXPENSE`) accounts so that balances display naturally (positive = increase)
- **Debit/Credit split**: Positive adjusted values → debit column, negative → credit column (shown as positive)
- **Debit/Credit column visibility**: Income accounts hide the debit column; Expense accounts hide the credit column; Equity (non-Expense) accounts hide the balance column
- **Running balance**: Accumulated across all bookings in chronological order
- **Counterparty names**: Derived from sibling bookings on the same transaction, deduplicated
- **Navigation**: Double-click an account row on the accounts list to open its ledger; back link returns to accounts list

## Validation Pattern

Shared validators live in `src/shared/account-validation.ts` and are used both client-side (in Mantine form `validate`) and server-side (in server function handlers).

- Per-field validators (e.g. `validateAccountName`) return an error message string or `null`
- Full-input validators (`validateAccountInput`, `validateAccountGroupInput`) throw on the first error
- **Duplicate name checking**: name validators accept an optional `siblingNames` parameter. The server queries sibling names before validation; the client derives them from `existingNodes` (the full tree data passed to modals)

## Transaction Editing (SplitTransaction)

`src/components/split-transaction.tsx` handles create/edit of transactions with split bookings:

- **Debit/credit mutual exclusivity**: setting one clears the other
- **Current account booking**: locked (read-only), always first in the list
- **Minimum bookings**: at least 2 bookings enforced
- **Date propagation**: date changes propagate to all bookings
- **Unit auto-population**: unit is auto-populated from selected account metadata

### Account Type Debit/Credit Restrictions

- **Income** accounts may not have a positive (debit) value
- **Expense** accounts may not have a negative (credit) value
- Enforced both client-side in `SplitTransaction` and server-side in `validateAccountTypeBookings()`

### Form Root Validation

- All bookings must have the same unit
- Debit/credit must balance (sum difference < 0.001)

### Unit Identifier Pattern

Bookings are grouped by a unit identifier string: `currency:${code}`, `crypto:${symbol}`, or `security:${symbol}`. Only one unit identifier is allowed per transaction.

## AG Grid Column Types

Defined in `src/components/column-types.tsx`:

- `FORMATTED_NUMERIC_COLUMN` — right-aligned, `en-CH` locale number formatting
- `SELECT_COLUMN` — searchable dropdown editor
- `TEXT_COLUMN` — text input editor
- `DATE_COLUMN` — date input with min/max constraints from context

## AG Grid Context Pattern

Grids pass a context object to cell renderers and editors containing helper data, form references, and callbacks.

## AG Grid Column Filters

Columns use AG Grid's built-in filter UI (not URL search params):

- `filter: "agTextColumnFilter"` — text contains/starts-with filter
- `filter: "agNumberColumnFilter"` — numeric comparison filter
- `filter: true` — default filter for the column type
- `filter: false` — explicitly disable filtering on a column (e.g. actions column)

## AG Grid Theme Synchronization

`AgThemeModeSynchronizer` (in `__root.tsx`) listens to `useComputedColorScheme()` and sets `data-ag-theme-mode` on `documentElement`. The AG Grid Quartz theme responds to this attribute to switch between light and dark mode. AG Grid theme config is in `src/components/grid-theme.tsx`.

## Row Drag-and-Drop Pattern

The accounts tree supports reordering rows via drag-and-drop within the same parent level:

- AG Grid's `rowDrag` is enabled; `rowDragManaged` is **not** used (manual DnD events)
- A `dragIndicatorRef` tracks the drop target and position (`"above"` | `"below"` | `null`)
- `getRowClass()` returns `"drag-indicator-above"` or `"drag-indicator-below"` to render a box-shadow indicator line via CSS (in `grid-theme.css`)
- On `rowDragEnd`, the new `sortOrder` values are computed and sent to `reorderAccountTreeItems`; the loader is then invalidated to refresh the tree

## Node Type Mixing in Tree Data

The `getAccountTreeData` server function returns a single flat array where each row has a `nodeType` field (`"account"` or `"accountGroup"`). AG Grid's tree data groups them hierarchically. Fields that don't apply to a node type are `null`.

## FormattedNumberInput

`src/components/formatted-number-input.tsx` wraps Mantine's `NumberInput` using `Intl.NumberFormat` to extract locale-specific thousand/decimal separators (defaults to `en-CH`). Used in `FORMATTED_NUMERIC_COLUMN` and `SplitTransaction`.

## Session Storage for UI State

Expanded group IDs are persisted in sessionStorage with the key `cashfolio:expandedGroups:${accountBookId}:${tab}`.

## Transaction Highlighting

The ledger supports a `transactionId` search param to auto-scroll to a transaction, flash its cells, then clear the param from the URL.

Implementation: `pendingScrollRef` stores the target transaction ID; on `RowDataUpdated`, the grid calls `ensureNodeVisible()` for all matching rows. After the scroll completes (via `bodyScrollEnd` or a double `requestAnimationFrame` fallback), `flashCells()` is called. The search param is cleared immediately on mount to avoid re-triggering on re-renders.

## Theme & Styling

- Theme config in `src/theme.ts`: `primaryColor: "blue"`, `defaultRadius: "md"`, `fontFamily: "Inter, sans-serif"`
- AG Grid theme in `src/components/grid-theme.tsx` maps Mantine CSS variables to AG Grid theming
- PostCSS configured with `postcss-preset-mantine` and `postcss-simple-vars`

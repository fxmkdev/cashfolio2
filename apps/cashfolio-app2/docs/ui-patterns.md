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
- **Running balance**: Accumulated across all bookings in chronological order
- **Counterparty names**: Derived from sibling bookings on the same transaction, deduplicated
- **Navigation**: Double-click an account row on the accounts list to open its ledger; back link returns to accounts list

## Validation Pattern

Shared validators live in `src/shared/account-validation.ts` and are used both client-side (in Mantine form `validate`) and server-side (in server function handlers).

- Per-field validators (e.g. `validateAccountName`) return an error message string or `null`
- Full-input validators (`validateAccountInput`, `validateAccountGroupInput`) throw on the first error
- **Duplicate name checking**: name validators accept an optional `siblingNames` parameter. The server queries sibling names before validation; the client derives them from `existingNodes` (the full tree data passed to modals)

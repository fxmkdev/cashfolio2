# UI Patterns

## Mantine

- **Mantine 8** for all UI components, forms (`@mantine/form`), and theming
- **AG Grid Enterprise** wrapped in `src/components/data-grid.tsx` with tree data support

## Modal Pattern

`EditAccountModal` and `EditAccountGroupModal` share these conventions:

- **`isResettingRef`**: a ref set to `true` while the form is being reset inside `useEffect`, so that `onValuesChange` can skip side effects (e.g. clearing dependent fields) during reset
- **`onExitTransitionEnd`**: used to defer clearing `initialValues` state until after the close animation, so the modal title stays stable ("Edit Account" not "New Account") while closing
- **`forceUpdate` reducer**: triggers a re-render after programmatic `setFieldValue` calls on uncontrolled forms

## Type Descriptor Pattern

Account/group types are represented in form selects as composite strings:
`"ASSET" | "LIABILITY" | "EQUITY-INCOME" | "EQUITY-EXPENSE" | "EQUITY-GAIN_LOSS"`

The form's `transformValues` splits these into separate `type` and `equityAccountSubtype` fields. When the type descriptor changes, dependent fields (group, parent group) are reset.

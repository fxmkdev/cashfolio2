# UI Patterns

Scope: This document describes `apps/cashfolio-app2`. Unless noted otherwise,
paths are relative to that app directory.

## Shared Contract Ownership

Cross-feature contracts belong in `src/shared/`, independent of UI components
and server implementations. Import `AccountOption` directly from
`src/shared/account-options.ts` in account selectors, transaction editors, route
controllers, and bulk-action helpers. The transaction-modal modules retain
compatibility type re-exports; editor-only `BookingValues` and
`TransactionFormValues` remain in the editor's types module.

Account-tree rows use `AccountTreeRow` from `src/shared/account-tree.ts`. Public
gain/loss response types, source rows, pricing-source values, and diagnostic
reasons live in `src/shared/gain-loss-reconciliation.ts`. Shared helpers, UI
consumers, and server implementations import these contracts directly from their
shared owners. Existing server type exports remain as compatibility re-exports.
Money-based reconciliation inputs and calculation callbacks remain server
implementation details.

The Accounts grid adapts wire/projection `TreeRow` values to a client-only
`AccountsGridRow` discriminated union in
`src/components/account-management/account-grid-rows.ts`. `rowType`
distinguishes persisted accounts, persisted groups, synthetic headings, and the
total footer. Convert rows at the presentation boundary with
`toAccountGridTreeRow`; server payloads, IDs, hierarchy ordering, and expansion
keys remain unchanged. Use `isPersistedTreeRow`, `isPersistedAccountRow`, or
`isPersistedGroupRow` before edit/delete/child-creation actions, including
callbacks from the shared hierarchy editor. Mutation target builders accept only
persisted variants. Synthetic headings can retain group checkboxes for
descendant selection, but bulk targets include persisted account leaves only.
Read-only projection helpers can still consume source rows.

The `cashfolio/no-ui-dependencies` ESLint rule rejects dependencies from
production modules in `src/shared/` and `src/server/` into `src/components/` or
`src/routes/`. It also rejects dependencies from production `src/shared/`
modules into `src/server/`, including type-only dependencies. Server modules may
depend on shared contracts and other server modules. The rule checks type-only
imports, re-exports, literal dynamic imports, TypeScript import types, and
literal `require` calls as well as regular imports. Both `@/` and normalized
relative paths are checked. Test and integration-test files are exempt so they
can compare behavior across layers.

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
| `navigation/`         | Router link wrappers, breadcrumbs, and navigation progress                    |
| `layout/`             | Page shells and page headers                                                  |
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

See [Global Navigation Progress](routing.md#global-navigation-progress) for
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

## Tables

Use **AG Grid Enterprise** through the shared `DataGrid` wrapper
(`src/components/grid/data-grid.tsx`) for all tabular UI, including small,
read-only, and modal tables. This keeps theme, locale, scrolling, resizing, and
row actions consistent. Apply this guideline when adding or changing tables;
existing tables elsewhere can be migrated in focused follow-ups.

Use native tree data for hierarchical records, with stable row IDs. Keep stored
manual ordering authoritative in hierarchy management and Organize mode. Follow
the shared column and actions-cell conventions below.

## Hierarchical Selection

Use Mantine `TreeSelect` for hierarchical choices, including account groups and
asset classes. Show the actual parent/child structure with expandable branches
and indented node names rather than a flat list of path labels. Build the tree
from stable IDs and parent IDs, preserve configured sibling order, and treat
slashes in user-entered names as literal text.

Make selectors searchable across full `Parent / Child` paths, ignoring case and
surrounding whitespace, so duplicate names in different branches can be found.
Display the selected node's name in the input. Expansion controls navigate the
tree independently of selection; parents and leaves can both be selected when
allowed by the field. Retain Mantine's keyboard navigation and portal behavior
inside dialogs.

Use domain wrappers for shared selection behavior: `GroupTreeSelect` for account
groups and `AssetClassTreeSelect` for asset classes. Make field eligibility
explicit: exclude an edited node and its descendants from parent choices, and
exclude a deleted node from replacement choices. Optional fields can be cleared;
explain their empty state with a placeholder such as Top Level or Unclassified.
Actions that require an explicit choice, such as bulk assignment and deletion,
offer Unclassified as a root option while keeping an untouched field unselected.

When refreshed choices remove a selected node, preserve its ID and draft,
display an unavailable-selection explanation, and prevent selecting the stale
option. Let the user choose a valid replacement or clear an optional field.

## UI Copy

- Keep labels short and action-oriented. Prefer concise commands such as
  `Create New` over longer menu text when the surrounding context already names
  the object.

### Capitalization

Cashfolio uses Title Case for short English UI labels and titles, and sentence
case for prose and instructions. Classify text by its purpose, not its component
or prop name: a tooltip can name an action or explain why it is unavailable; an
`aria-label` can name a control or describe its current state.

This is Cashfolio's product convention, not a universal UX requirement.
[Apple's writing guidance](https://developer.apple.com/design/human-interface-guidelines/writing)
recommends choosing a consistent style for each element type. The mechanics
below follow the capitalization entry in the
[Apple Style Guide](https://help.apple.com/pdf/applestyleguide/en_US/apple-style-guide.pdf#page=45).
Other systems choose differently; for example,
[Microsoft's style guide](https://learn.microsoft.com/en-us/style-guide/capitalization)
generally uses sentence case even for UI labels. Research reviewed October
23, 2026.

| Text role                                                                                                                        | Convention                                                                         | Cashfolio examples                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Page/document, dialog, section, card, and chart titles; table/grid headers and chart legends                                     | Title Case for short titles                                                        | `Create Account Book`, `Gain/Loss Details`, `Trade Currency`                             |
| Buttons, navigation links, menu items, tabs, field labels, short checkbox/switch/radio labels, and predefined choices            | Title Case                                                                         | `Copy Example`, `Include in Cash Flow`, `Opening Balances`                               |
| Short action tooltips and accessible control names                                                                               | Title Case; use the visible label's wording and casing when naming the same action | `Show Gain/Loss Details`, `Include All Rows`                                             |
| Explanations, helper text, validation errors, notification bodies, empty states, and progress/status messages (including badges) | Sentence case, even for fragments                                                  | `No regional format found`, `Deletion pending`, `Loading calculation`                    |
| Instructional placeholders, explanatory tooltips, and accessibility instructions/descriptions                                    | Sentence case                                                                      | `Select target account`, `You cannot delete yourself`, `Press Space to toggle inclusion` |
| Alert and notification headings                                                                                                  | Title Case for short titles; sentence case for statements or questions             | `Partial Data`, `This cannot be undone`, `Discard reviewed statement?`                   |
| User content, example values, identifiers, brands, acronyms, and technical literals                                              | Preserve appropriate spelling and casing                                           | `Cashfolio`, `CSV`, `CHF`, `Gain/Loss`, `https://example.com/avatar.png`                 |

Outcome headings such as `Statement imported` and `Account book switched` report
status and stay in sentence case, even though they are short.

A label embedded in prose does not make surrounding words Title Case. Write
generic financial terms normally in sentences, such as "Choose an account book"
or "The cash account is archived." When explicitly referring to a control by
name, match its label, such as "Choose a Target Account."

#### Title Case mechanics

- Capitalize the first and last words and the first word after a colon, while
  preserving brand names and technical literals with intentional casing.
- Capitalize nouns, pronouns, verbs (including `Is`, `Are`, and `Be`),
  adjectives, adverbs, subordinating conjunctions (such as `If`), and
  prepositions with five or more letters (such as `Since`, `About`, and
  `Between`).
- Lowercase internal articles (`a`, `an`, `the`), coordinating conjunctions
  (`and`, `but`, `or`, `nor`, `for`, `yet`, `so`), prepositions of four or fewer
  letters (`to`, `of`, `in`, `on`, `from`, `with`, etc.), infinitive `to`, and
  `as`. Examples: `Back to App`, `Contribution to Total Return`, `Save as CSV`.
- Capitalize particles in phrasal verbs: `Sign Out`, `Log In to Cashfolio`,
  `Turn On Notifications`. Their grammatical role matters, not just length.
- Capitalize the second part of a hyphenated compound, such as `Period-End Rate`
  and `30-Day Breakdown`; retain Apple's `Built-in` and `Plug-in` exceptions.
  Apply the same word rules on each side of a slash: `Gain/Loss Details` and
  `Debit/Credit Direction`. Preserve abbreviations and follow the
  [slash-spacing rules](#slashes) for punctuation.
- Do not add a period to a short label or title. Retain meaningful question
  marks and existing action ellipses. Sentence case capitalizes the first word
  and proper nouns; normal sentence punctuation applies to explanatory
  sentences.

#### Preserved content

Never recase user/book/account names, imported descriptions, provider names,
symbols, currency codes, dates, filenames, URLs, JSON keys, or confirmation
values. Example values retain their intended casing. Do not change enum values,
stored data, API fields, or routes to fix displayed copy. External provider
pages are outside this policy's implementation scope.

#### Authoring and review checklist

- Review customer and admin screens, shared components, display-string helpers,
  document titles, charts/grids, tooltips, placeholders, and accessibility text.
  Include app-owned server-rendered pages and text overrides for exposed library
  controls. Use supported library overrides where necessary.
- Review each string in context, including both outcomes of conditional labels.
  Keep explanatory or disabled-reason tooltips in sentence case even when their
  action tooltip uses Title Case. Preserve dynamic content in mixed labels.
- Author correct strings directly. Do not use runtime title-casing, CSS
  `text-transform: capitalize`, or blanket search-and-replace over UI text.
- Update affected unit tests, Storybook interactions, E2E accessible-name
  selectors, and documentation examples together. Check rendered text for
  truncation and verify that accessible names still identify visible actions.
- Use this checklist during review; capitalization has no automated lint rule.

### Slashes

Use slashes sparingly in compact labels. In prose and instructions, prefer `and`
or `or` when that makes the relationship clearer. For app-owned UI copy, apply
these spacing rules consistently to visible text and accessible names:

- **Single-word alternatives or paired terms:** no spaces, including
  abbreviations. Examples: `Gain/Loss`, `Debit/Credit`, `Ccy./Symbol`.
- **Multiword alternatives:** one space on both sides if either term contains
  spaces. Examples: `Income Category / Expense Category`,
  `Account / Income Category`. Never put a space on only one side.
- **Shared surrounding words:** consider the terms joined by the slash, rather
  than every word in the label. Write `Debit Accounts/Categories` and
  `Credit Accounts/Categories`: `Debit` or `Credit` applies to both `Accounts`
  and `Categories`, so the joined terms are single words. Likewise, write
  `Gain/Loss Details`, `Gains/Losses Breakdown`, and
  `Swap Debit/Credit Direction`. If shortening
  `Income Category / Expense Category` to share the noun, write
  `Income/Expense Category`.
- **Displayed hierarchy paths:** keep spaces around the separator regardless of
  segment length, such as `Assets / Cash / Checking`. These slashes separate
  levels rather than alternatives.
- **Technical and conventional notation:** preserve the required format in URLs,
  file paths, date formats, fractions, units, and currency pairs, such as
  `https://example.com`, `MM/dd/yyyy`, `1/2`, `km/h`, and `EUR/CHF`. Do not
  normalize user-entered names or imported content.

The transaction headers `Debit Accounts/Categories`,
`Credit Accounts/Categories`, and `Ccy./Symbol` therefore all use unspaced
slashes. Do not change spacing to control line wrapping; address wrapping
through layout or clearer wording.

This is Cashfolio's house style, following the
[Chicago Manual of Style's word-versus-phrase distinction](https://www.chicagomanualofstyle.org/qanda/data/faq/topics/Punctuation/faq0096.html).
Style guides differ; the goal is a consistent, readable product convention.
Research reviewed October 25, 2026.

### Identity and financial-account terminology

Cashfolio has distinct `User`, `AccountBook`, and `Account` entities. Keep their
names distinct in routes, modules, types, functions, props, tests, and docs:

| Concept                            | App-owned code                                                     | Customer-facing wording                                                  |
| ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Sign-in identity                   | `User`, `user-deletion`, `deleteAuthenticatedUser`, `/user/delete` | "Cashfolio account" in prose; "Delete My Cashfolio Account" as an action |
| Identity security                  | `userSecurityUrl`, `getUserSecurityUrl`                            | "Sign-In & Security"                                                     |
| Financial account                  | `Account`, `deleteAccount`, `accountId`                            | "Account", "Delete Account", with the account name visible               |
| Book containing financial accounts | `AccountBook`, `accountBookId`                                     | "Account Book"                                                           |

Identity labels follow the general capitalization policy: use "Delete User" in
admin actions and "User Settings" for personal preferences. Generic references
to a "Cashfolio account" or "user" in prose stay in sentence case. Avoid
unqualified "account settings" or "account deletion" for identities in app-owned
code, diagnostics, or documentation.

Provider-scoped terms such as `LogtoAccountResponse`, Logto Account API, and
`/api/my-account` retain the provider's terminology. See
[self-service deletion](server-functions.md#auth-and-authorization) for the
app-owned user deletion flow.

Destructive UI must identify the target and explain its consequences. User
self-deletion uses "Delete Your Cashfolio Account" as the page title and "Delete
My Cashfolio Account" as the action. The outcome heading "Cashfolio account
deleted" stays in sentence case because it reports status. Explain loss of
sign-in access, deletion of books only that person can access, and preservation
of shared books for other users; show the affected-book preview.
Financial-account deletion shows the financial account's name alongside "Delete
Account". Keep provider storage details out of ordinary profile and deletion
copy; technical admin tools and architecture docs may name Logto.

## Label Typography

- When a label combines a short code with a human-readable name, separate them
  with an en dash (`–`), not a hyphen-minus (`-`). Example: `CHF – Swiss Franc`.

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

### Field Help

Keep essential instructions and validation messages visible beside or below the
input. Put longer optional explanations in a popover opened by an info icon
beside the field label, as used for Asset Class and Tracking Method. Give the
button a descriptive accessible name such as `Show Tracking Method Help` and a
matching tooltip. Support mouse and keyboard activation, keep the popover within
the viewport, and return focus to its trigger when closed. Escape dismisses the
popover without closing its containing dialog.

### Account Editor

The account editor groups identity fields first, followed by unit details and
the Cash Account flag, then Opening Balance beside Asset Class. Columns stack at
narrow viewport widths. Opening Balance keeps concise sign guidance below the
input; the detailed Asset Class and Tracking Method explanations are available
in info-icon popovers beside their labels. Tracking Method appears only for
currency-denominated balance accounts. Statement Import Settings is collapsed at
the start of each create/edit session. Its CSV editor stays mounted so
collapsing it preserves drafts, and submitting an invalid CSV format opens the
section to expose its validation error.

The account editor offers an **Asset Class** tree selector for assets and
liabilities, separate from Unit and valuation configuration. It remains editable
for booked and archived accounts while instrument identity stays locked.
Unclassified is the default; no classification is suggested or inferred from
Unit, cash flags, groups, or other fields. Users can choose any class or clear
back to Unclassified. Income, expense, and system equity accounts do not expose
this selector.

Accounts supports checkbox selection with the **Set Asset Class** and **Set
Tracking Method** toolbar actions. Balance-account leaves, real groups, and
virtual Archived groups show checkboxes. Group checkboxes select matching
descendant accounts, including nested and archived accounts regardless of
expansion, using AG Grid's native filtered-descendant selection. Empty groups
have disabled checkboxes; totals and categories are excluded. Groups show native
checked/indeterminate states, and individual accounts can be excluded from a
selection. The toolbar counts accounts, and requests contain only account IDs.

Filtered-out selections are removed, header select-all uses the filtered account
set, and clearing a filter does not add accounts to an existing selection.
Ordinary cell clicks retain their existing behavior. Selection resets when
switching account books or management contexts. The dialog freezes selected
account IDs when opened, shows total and archived counts, and requires an
explicit asset class or Unclassified. Applying replaces existing classifications
for the selected accounts and all historical Report/History periods. Errors
retain the choice for retry. Success clears selection and refreshes data. Groups
do not store a class or provide inheritance.

**Set Tracking Method** updates only selected currency-denominated balance
accounts, including booked and archived accounts. Securities, cryptocurrencies,
and accounts with missing unit metadata are skipped. The toolbar retains the
full selected count; the action is disabled with an explanation when no currency
accounts are selected. Its dialog freezes eligible account IDs, shows the
affected and archived counts plus any skipped count, and requires an explicit
**Individual Units** or **Total Value** choice. The shared field includes its
help popover. Applying replaces tracking methods for all historical
Report/History periods without rewriting bookings or changing valuation.
Submission prevents duplicate requests and dismissal; errors retain the choice
for refresh/retry, and success clears selection and refreshes data. Server
validation rechecks every submitted account inside one authorized book mutation
and rejects the whole request if any target is missing or no longer eligible.
Groups do not store or inherit a tracking method.

Assets and liabilities show `Account Group: … · Asset Class: …` as small, muted
text beneath the ledger name and compact type/unit/status badges, including on
archived accounts. Show the complete group and classification hierarchies in
their original capitalization, with `/` between path segments. Accounts with no
group show `Account Group: Top Level`; unclassified accounts show
`Asset Class: Unclassified`. Separate the fields with a spaced middle dot (`·`,
U+00B7), keeping it attached to the preceding field when text wraps. Allow long
paths to wrap. Category/equity ledger headers omit this metadata line.

The current classification applies to all historical periods in Report and
History. Calculated and recorded gains/losses support either Account Structure
or Asset Class → Subclass → Investment Group → Account; recorded adjustments use
their counterpart financial account's class and group. Changing classification
does not change amounts or valuation. Accounting `AccountType.EQUITY` is
unrelated to the Equities asset class.

`src/components/account-editor/edit-account-modal.tsx` remains the public
account-editor entry point, including its existing type and form-value exports.
Its implementation lives in `src/components/account-editor/`:

- `types.ts`: input props, initial values, and form-value contracts
- `values.ts`: initial-value creation, form transforms, and CSV JSON validation
- `controller.ts`: form validation, edit-session initialization, cash
  eligibility, submission, and close guards
- `view.tsx`: the account modal render tree
- `asset-class-field.tsx`: classification input and explanatory help
- `tracking-method-field.tsx`: tracking-method input and explanatory help
- `statement-import-csv-format-field.tsx`: CSV configuration input and JSON help

The form/controller is created once per modal render, and a constraint refresh
does not initialize a new edit session. Existing stories and value tests
exercise the public entry point so callers keep the same API.

Shared CSV configuration handling keeps
`src/shared/statement-import-csv-format.ts` as its public entry point.
Implementation modules in the sibling `statement-import-csv-format/` folder
separate types/headers, normalization, semantic validation, column/header
resolution, format/JSON reading, and nested mapping reading. These modules
remain independent of UI and server dependencies.

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

- Wrap `ActionIcon` components in a `Tooltip` describing the action (e.g.
  "Edit", "Delete")
- Action availability behavior is defined in `Action Availability Pattern`.
- Standard non-destructive row actions use the normal action color
  (`color="blue"`). Use semantic colors for destructive actions or
  special-impact actions such as archive.
- Tooltip `openDelay` is configured globally in `src/theme.ts` (default 500ms) —
  do not override per-instance unless necessary

Use the following shared icon reference for hierarchy actions:

| Action             | Tabler Icon      | Color  |
| ------------------ | ---------------- | ------ |
| Create / Add Child | `IconPlus`       | Blue   |
| Edit               | `IconPencil`     | Blue   |
| Archive            | `IconArchive`    | Yellow |
| Unarchive          | `IconArchiveOff` | Blue   |
| Delete             | `IconTrash`      | Red    |

Keep row actions in **Edit → Add Child → Archive/Delete** order, showing only
applicable actions. Outside the hierarchy management pages, multi-action rows
use the shared `RowActionsMenu` with labelled menu items and the same icons.
Separate Archive/Delete from the preceding actions; preserve Unarchive on
archived rows. Use the shared grid action-cell styles so actions appear on row
hover and keyboard focus. Disabled menu items show their reason in a multiline
tooltip on whole-item hover and keyboard focus, using the global tooltip delay.
A visually hidden description keeps the reason accessible while the tooltip is
closed. Use `aria-disabled`, preserve arrow-key focus, and guard activation and
menu closing; style disabled items with the shared CSS module. Disabled direct
buttons retain an explanatory tooltip. Pending mutations prevent duplicate
submission.

## Contextual Child Creation

Active, real financial account groups expose child-creation items in their
row-actions menu, without a nested Add Child menu. Category groups expose direct
child-creation icons on hover/focus in the hierarchy editor. Financial groups
offer **Add Account** and **Add Group**; category groups offer the current tab's
**Add Income Category** or **Add Expense Category**, plus **Add Group**. Leaf
accounts/categories, archived groups, virtual Archived rows, and totals have no
child-creation action. Asset classes can contain children at any level, so their
Add Child action opens the class editor directly.

Reuse the normal creation dialog with an editable parent prefilled through
creation-only `defaultGroupId` / `defaultParentGroupId` props. Keep edit-mode
`initialValues` separate: a prefilled parent must still create a new entity.
Preserve the editor's type compatibility, validation, and cash-flow inheritance.
Clear contextual defaults on cancellation, successful creation, book/tab
changes, and toolbar creation. Retain drafts on failed submission and use shared
waiting, retry, uncertain-outcome, and refresh feedback.

## Hierarchy Parent Selectors

Optional parent selectors show **Top Level** as a muted placeholder when no
parent is selected. Use the standard Mantine placeholder styling, show the
selected parent normally, and restore **Top Level** when the selection is
cleared. Apply this pattern in both creation and editing dialogs for accounts,
account groups, categories, category groups, and asset classes.

**Top Level** is display text only, not a selectable option or a stored value.
The shared `GroupTreeSelect` provides this placeholder by default and allows
callers to override it when needed.

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

- Use `createDocumentTitleHead` (`src/shared/document-title.ts`) from route
  `head` metadata for document titles.
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

## Period Breakdown Drill-Down Pattern

- Income and expense bars and allocation donut sectors use the automatic
  category palette, with a bottom legend naming the categories at the current
  drill level. Only Cash Flow bars opt into sign-based colors: green for
  positive amounts, red for negative amounts, and gray for zero; they do not
  show a category legend.
- Use each bar series' `yName` for its category legend text. Reserve
  `legendItemName` for intentionally linked series: AG Charts groups legend
  interactions by that name, so sibling accounts and groups with identical
  labels must not share it. Keep the custom tooltip's amount field named
  `Amount`.
- AG Charts 14 callbacks have no source datum for waterfall totals/subtotals.
  Use `itemType` to identify aggregate bars and the existing contribution model
  to format Savings and Total Return. Aggregate bars do not drill down.
- Style both waterfall total types through `item.total`; top-level `total`,
  `subtotal`, and `itemStyler` options are unsupported.
- The selective registry in `src/ag-chart-modules.ts` includes
  `CrossLinesModule` for report zero lines and history zero lines/current-period
  bands. Keep these explicit registrations when adding chart features.

- Report route (`src/routes/$accountBookId/report/route.tsx`) supports
  drill-down in:
  - Expense/Income/Cash Flow charts (`Bar`)
  - Assets/Liabilities Allocation charts (`Donut`)
  - Gains/Losses chart (`Waterfall`)
- Double-clicking a drillable chart node drills into its children.
- Allocation offers Donut and Table only; Expenses, Income, and Cash Flow offer
  Bar and Table only. Defaults are Donut for Allocation and Bar for Breakdown.
  Existing per-book session storage remembers the chosen mode across reloads,
  navigation, period changes, and grouping changes. Legacy Allocation Bar
  choices become Donut; legacy Breakdown Donut choices become Bar. Table choices
  and hierarchy drill paths are preserved.
- Breakdown bars are horizontal and ranked by descending amount, with the
  largest value at the top. Cash Flow uses signed numeric order; ties retain
  source order. Long category lists scroll within a 440px chart viewport. Full
  names, locale-aware amounts, and percentages remain available in tooltips.
  Cash Flow labels its percentage as Share of Absolute Movement, using the sum
  of absolute amounts at the current level as its denominator.
- Allocation donuts show at most five slices at each drill level. Above five
  categories, show the four largest plus Other last; ties retain source order.
  Other combines the remaining displayed categories without changing hierarchy,
  totals, or existing rounding warnings. The Table view retains the full
  hierarchy.
- Double-clicking Other or activating View Other Categories opens an Other
  Allocation dialog using the shared DataGrid. Show names, amounts, shares of
  the original chart-level total, and a subtotal. Row actions and double-clicks
  retain group drill-down and account-ledger navigation. Close details before
  navigation or whenever the period, book, grouping, side, mode, drill path, or
  data changes. Other is a synthetic chart datum and never enters persisted
  hierarchy paths.
- Other's Actions cells support Enter and Space after Tab/arrow-key navigation.
  Nested buttons stay outside the tab order so keyboard handling follows AG
  Grid's cell focus; synthetic balances and subtotal rows cannot act.
- Synthetic transfer-clearing balances remain visible in Other details and its
  subtotal, but have no ledger action or double-click navigation.
- Gains/Losses processes each native double-click once across the chart's node
  and single-item container handlers, including across rerenders. A unit with
  one account still opens the account chart; opening details requires a separate
  account double-click. A background double-click retains the single-item
  shortcut.
- Leaves have no further hierarchy to drill into. Supported account leaves can
  navigate to a ledger or gain/loss reconciliation for the selected period.
- Allocation and Gains/Losses support Account Structure and Asset Class →
  Subclass → Investment Group → Account. Investment groups use currency or
  cryptocurrency codes, security symbols (combining trade currencies), or Total
  Value Accounts for Total Value tracking. Retain the investment level even when
  it contains one account. Account metadata drives G/L navigation from chart and
  table leaves to the unified explanation, including calculated holdings,
  recorded adjustments, and supported synthetic amounts. Do not infer a
  destination from node-ID prefixes.
- Asset-class nodes drill into investment groups, which drill into accounts.
  Both group levels expand/collapse in tables and do not open a ledger.
- In Report's Asset Class view, account leaves show their full current account
  group path. Chart labels and tooltips use `Parent / Child / Account`; table
  cells show the account name above a smaller, dimmed, wrapping parent path.
  Table filtering and tooltips include the full path. Account Structure already
  supplies the group context and keeps account names alone. Ungrouped accounts
  and synthetic G/L entries retain their names without an invented path.
- Allocation processes each native double-click once across chart node and
  single-item container handlers, so opening an account requires a separate
  double-click after entering its investment group.
- Keep drill state local to the page and scoped per card/type, preserving each
  side/path when toggling chart mode or breakdown side.
- Report's **Group Accounts By** selector sits beside the period control and
  uses a compact 13rem width on desktop. Below the `sm` breakpoint, the selector
  fills the available width and the period control moves to the next row. It
  applies together to Assets, Liabilities, and Gains/Losses charts and tables.
  It defaults to Account Structure and uses per-book session storage. Income,
  Expenses, and Cash Flow retain their existing category/account breakdowns.
- The shared period control keeps the same width for month, year, and All
  Periods labels. Its trigger uses Mantine's `w` prop with
  `clamp(8.5rem, 16vw, 12rem)` so its responsive width takes precedence over
  Mantine's default button width regardless of stylesheet load order.
- Preserve allocation and G/L drill paths separately per grouping, and namespace
  expanded-table storage by grouping. Legacy allocation paths belong to Account
  Structure; legacy G/L paths belong to Asset Class. Chart type choices survive
  switching. Recreate the table when its expansion-storage key changes. When
  switching account books, hydrate the destination book's session state before
  clamping paths or writing preferences under its storage key.
- History's Gain/Loss View contains **By Account Structure** and **By Asset
  Class** navigation headings, in that order. Clicking or pressing Enter on a
  heading only toggles expansion; it keeps the dropdown open and preserves the
  chart selection and URL. Actual groups/classes and the Gain/Loss total remain
  selectable. Search paths and scoped chart descriptions include the grouping.
- Grouping does not change total amounts. Allocation footers and chart totals
  use the rounded sum of exact balances. G/L footers use exact contribution
  aggregates. G/L waterfalls use the displayed group amounts without a separate
  Rounding bar. Their Total tooltip retains the selected scope's authoritative
  total and explains rounding when it differs from the sum of displayed groups
  at cent precision. Waterfall geometry follows the displayed group amounts.
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
- Clamp stale drill paths to the nearest surviving saved ancestor when refreshed
  data or a different period no longer contains a node. For Asset Class G/L,
  reconstruct that ancestor’s current stable-ID path after a reparent. Reset to
  the root only if no saved ancestor survives.

## Reference Currency Display Principle

Treat the account book reference currency as the standard case in UI display.
When a row already has a reference-currency amount column, do not repeat the
reference currency in adjacent unit columns or duplicate the same amount in the
booking-unit debit/credit columns. Show native unit labels and native
debit/credit amounts only when they add information, such as foreign currency,
crypto, or security bookings.

## Accounts and categories

`Account` remains the unified internal bookkeeping entity. In customer-facing
copy, **accounts** are the existing asset/liability accounts; **categories** are
income, expense, and gain/loss accounts. Opening Balances remains a special
system account. Identity actions still use "Cashfolio account".

Account management uses one Accounts hierarchy without asset/liability tabs.
Income and expense category management lives under **Account Book Settings →
Categories**, with Income and Expenses tabs and a **Show Archived** checkbox.
Gain/Loss and Opening Balances retain their system-managed restrictions and are
not creation tabs. Primary navigation is unchanged. Viewing a category ledger is
an activity view, not a settings page: its URL remains unchanged, and no primary
navigation item is selected. Balance-account ledgers continue highlighting
Accounts.

Settings uses underline tabs for General/Categories and pill tabs for
Income/Expenses. Category type tabs and management actions share a wrapping
toolbar. General and Categories omit visible page headings while retaining
visually hidden semantic headings and document titles. **Show Archived** sits
beside the category-type pills; there is no separate archive page or breadcrumb.

Accounts combines active and archived items in one hierarchy. Categories
defaults to active items; enabling **Show Archived** requests both states and
reuses the same collapsed virtual Archived branches, sorting, and archived-row
actions. Visibility lives in the `showArchived` URL boolean, persists across
type changes, reloads and browser history, and defaults off on fresh visits.
Legacy `mode=archived` links normalize to visibility enabled with replacement
navigation. Creation always produces active items. Real-group expansion
preferences retain the existing per-book/type active-view session key. Category
archive tooltips explain preserved history rather than financial totals.

Categories have explicit **category groups**, backed by `AccountGroup`. Groups
can contain categories and nested groups; categories can also be at the root.
Only categories accept bookings and are selectable transaction destinations.
Preserve existing subtype compatibility and ordering rules. Use "Add Income
Category"/"Add Expense Category", "Add Group", and "Category Group" in forms.
Selectors accepting both entities use "Account or Category".

Equity accounts, including income/expense categories, Gain/Loss, and Opening
Balances, have no account-level unit metadata (`unit`, `currency`,
`cryptocurrency`, `symbol`, or `tradeCurrency`). Their bookings carry their own
unit metadata. Shared account validation rejects these fields on equity
accounts. Application create/update mutations continue normalizing away hidden
category unit fields before validation; seeds must supply valid account data.

Use the shared `account-presentation` predicates and labels at presentation
boundaries. These names do not change stored account types, booking signs,
income/expense direction rules, or calculations.

Asset and liability account balances use the same signed convention: positive
means owned and negative means owed. This applies to native and
reference-currency balances, opening balances, ledger running balances, and
statement import previews. Opening-balance inputs use that same sign without
type-based inversion. Report and History classify Assets/Liabilities by balance
sign; debt amounts are positive magnitudes in those reports.

## Accounts List Columns

- The `Name` column is frozen on the left, starts at 320px, and can be resized
  with a 320px minimum width. Row actions are frozen on the right at 56px. When
  columns no longer fit, scroll horizontally inside the grid to reach the middle
  columns. In both category tabs, `Name` is unpinned and flexes to fill the
  space beside the row actions, retaining its 320px minimum width. These layouts
  also apply when archived items are visible. AG Grid automatically unpins
  columns when the viewport is too narrow to accommodate the frozen columns.
- G/L figures use the order `Total`, `Realised`, `Unrealised` in the Accounts
  grid, account summary, calculation drawer, and period reconciliation cards.
- The Accounts scope (`BALANCE`) renders `Name`, `Ccy./Symbol`, `Balance`,
  `Balance (<referenceCurrency>)`, G/L, `Asset Class`, `Tracking Method`, and
  row actions in that order.
- `Ccy./Symbol` starts at 180px and has a searchable set filter. It shows
  foreign currency codes, cryptocurrency tickers, or security symbols; security
  trade currencies are omitted. Group, virtual Archived, and total rows stay
  blank. The filter uses underlying identifiers, including the reference
  currency even when its cell display is blank.
- `Asset Class` follows the G/L Since Start column group, starts at 220px, and
  can be resized. Its set filter follows the asset-class hierarchy; its tooltip
  uses the full display label. Unset accounts show muted `Unclassified`. Real
  groups and virtual Archived groups summarize all descendant accounts,
  including archived accounts, regardless of collapse or grid filters: one
  distinct value shows its label; multiple values show `Mixed`. Unclassified
  counts as a distinct value, so all-unclassified groups show muted
  `Unclassified`, and classified plus unclassified shows `Mixed` in normal text.
  Empty subgroups do not contribute a value; groups without descendant accounts
  and the total row stay blank. Group summaries are read-only. The column
  preserves the existing sibling ordering and grid-only horizontal scrolling.
- `Tracking Method` follows Asset Class, starts at 220px, and can be resized.
  Its set filter and tooltip use the labels `Individual Units`, `Total Value`,
  and `Mixed` where applicable. All balance-account leaves show their method,
  including archived accounts; securities, cryptocurrencies, and missing
  metadata show `Individual Units`. Real groups and virtual Archived groups
  summarize descendant accounts with the same inclusion rules as Asset Class:
  one distinct method shows its label, differing methods show `Mixed`, and empty
  groups and the total row stay blank. Group summaries are read-only; category
  tabs do not show this column.
- `Balance` is account-level only (group rows are blank), with no aggregation.
- Currency accounts whose currency matches the account book reference currency
  leave `Ccy./Symbol` and `Balance` blank to avoid duplicating the value already
  shown in `Balance (<referenceCurrency>)`.
- `Balance (<referenceCurrency>)` is account-level for leaf accounts across
  `Unit.CURRENCY`, `Unit.CRYPTOCURRENCY`, and `Unit.SECURITY` when a reference
  conversion is available (or the raw balance is 0), and shows aggregated
  descendant sums on group rows.
- Accounts renders a pinned footer row with `Total` in
  `Balance (<referenceCurrency>)`.
- If any descendant account in a group has a blank
  `Balance (<referenceCurrency>)`, that group row stays blank in this column to
  avoid partial totals.
- The footer `Total` also stays blank when any account row in Accounts has a
  blank `Balance (<referenceCurrency>)` value.
- Balances are displayed in each account's own unit/currency; no conversion.
- Liability balances retain their stored sign, including group and footer sums.
- For right-aligned numeric columns, loading and placeholder content inside
  cells must also be right-aligned (for example dotted loaders in
  `Balance (<referenceCurrency>)` cells).

## Action Availability Pattern

- For each conditional action, provide both:
  - an availability boolean (e.g. `deletable`, `archivable`, `unarchivable`)
  - a disabled-reason string (e.g. `deleteDisabledReason`,
    `archiveDisabledReason`, `unarchiveDisabledReason`)
- In the UI, always render the action and wire availability to
  `ActionIcon.disabled` for direct buttons or `aria-disabled` with guarded
  activation for menu items.
- The tooltip label should use the disabled reason when unavailable, otherwise a
  default action label.
- Enforce rules server-side as well; UI availability is an affordance, not an
  authorization check.

## Data Grid Actions Column

- Use the shared `RowActionsMenu` for multiple row actions. Its compact
  `size="sm"` (22px) vertical-dots trigger has a **More Actions** tooltip and a
  row-specific accessible name. Keep a single action as a direct button. Ledger
  keeps **Edit** directly beside the menu containing **Copy**, **Rebook**, and
  **Delete**; Edit is not duplicated in that menu.
- Account List Organize mode keeps three direct icons for **Move To…**,
  **Archive/Unarchive**, and **Delete**, making its structural tools immediately
  accessible. It uses `rowActionsColumnProps` for keyboard access and grid event
  isolation, overriding width/minWidth/maxWidth to 120px.
- Categories and Asset Classes are always hierarchy editors. Use direct
  hover/focus icons, with no More menu. Order: Move To, Edit, applicable child
  creation, Archive/Unarchive (categories only), Delete. Categories provide two
  distinct child controls for a category and a group; asset classes provide Add
  Child at every level. Keep controls pinned right with room for all icons and
  accessible row-specific names, disabled reasons, and dialog focus restoration.
- Spread `rowActionsColumnProps` into menu column definitions: blank header,
  fixed 56px width, no sorting/filtering/resizing/header menu, grid event
  isolation, keyboard access to renderer buttons, and
  `cellClass: "actions-cell"`. Ledger overrides width/minWidth/maxWidth to 88px.
  Preserve existing column pinning. Ledger Edit also uses `size="sm"`. Both
  controls retain 16px icons.
- Action controls appear on whole-row hover and keyboard focus, including pinned
  cells, and stay revealed while their menu is open (styled in
  `src/components/grid/grid-theme.css`). Neither the dots nor Ledger Edit are
  permanently visible. Rely on AG Grid's row state rather than hovering only the
  actions cell.
- Menus render in a portal, aligned bottom-end with viewport collision handling.
  Menu interactions must not select rows or start grid editing. Preserve
  keyboard navigation and return focus on dismissal without stealing focus from
  a dialog opened by an action. Focus the stable row trigger immediately before
  invoking an enabled action so a newly opened dialog captures it as its return
  target. Keep focus inside the dialog until it closes, then return to that
  trigger if it is still mounted.
- Reuse this class in modal grids too (for example `EditTransactionModal`'s
  actions column) to keep action affordances consistent across the app
- Wrap a direct action plus the menu trigger in a
  `<Group gap={4} wrap="nowrap" h="100%" align="center">`
- If actions-column rendering grows beyond simple inline JSX, extract it into
  dedicated components under `src/components/` and keep the route focused on
  state/server orchestration

## Deletion Pattern

- Add `deletable` and `deleteDisabledReason` fields to data returned from the
  server
- Check constraints server-side before deleting (never trust client-side
  `deletable` alone)
- Use `<ConfirmDeleteModal>` (`src/components/dialogs/confirm-delete-modal.tsx`)
  for delete confirmations — props: `opened`, `onClose`, `title`, `name` (the
  item being deleted), `onConfirm`

## Archive / Unarchive Pattern

- Add `archivable` and `archiveDisabledReason` fields to tree rows returned from
  `getAccountTreeData`
- Add `unarchivable` and `unarchiveDisabledReason` fields for archived-row
  actions
- Keep enforcement server-side:
  - account archive constraints in `archiveAccount`
  - group archive constraints in `archiveAccountGroup`
  - unarchive parent-chain constraints in `unarchiveAccount` and
    `unarchiveAccountGroup`
- Active rows use archive confirmation via `<ConfirmArchiveModal>`
  (`src/components/dialogs/confirm-archive-modal.tsx`)
- Archived rows trigger unarchive directly from the action icon (no confirmation
  modal)

Accounts uses one hierarchy for active and archived rows. Virtual Archived
groups are collapsed by default, stay last among siblings, and have no mutation
actions. Their display parents must never be submitted as real parent IDs. See
[Archived groups and totals](valuation-reference-balances.md#archived-groups-and-totals).

## Type Descriptor Pattern

Account management uses the persisted type `BALANCE` for all balance accounts
and groups. The Type field is hidden in their editors. Both positive and
negative balances use the same type; report classification depends on the
balance at the reporting date. No booking values or IDs are migrated.

Category editors retain the disabled Income/Expense Type field. Gain/Loss and
Opening Balances remain system-managed and cannot be created through these
forms.

Balance accounts and groups can share any balance-group parent. Parent
compatibility is enforced on the server, including account-book ownership,
active-parent requirements for active nodes, category-subtype compatibility, and
cycle prevention. Existing group IDs and names remain distinct.

**Include in Cash Flow** controls whether a currency balance account
participates in cash-flow reporting. Transfers entirely between included
accounts are excluded from cash flow. This setting is independent of **Asset
Class**, which classifies holdings for reporting; selecting **Cash & Cash
Equivalents** does not include an account in cash flow.

The setting is stored in `isCashAccount`. Root flags default to false; children
inherit the parent group flag. Groups included in cash flow may contain only
currency balance accounts and balance sub-groups, including archived
descendants. Securities, crypto, and categories are ineligible. Reparenting or
toggling a group propagates the inherited flag through its subtree and
invalidates derived book caches.

Accounts links canonicalize to `tab=BALANCE&mode=active`, including legacy
asset/liability/archive links. Category redirects retain the category tab and
map legacy archive mode to `showArchived=true`. Selectors use an Accounts root
for balance accounts; ledger badges show Account with a neutral color. Report
Assets/Liabilities remain balance-based labels. Unified account expansion
preferences use `cashfolio:expandedGroups:${accountBookId}:active:BALANCE`,
initially seeded from the union of valid `active:ASSET` and `active:LIABILITY`
preferences. Once written, the unified preference takes precedence, including an
empty collapsed selection.

## Explicit Gain/Loss for Manually Valued Accounts

Use the system-managed **Gain/Loss** equity account to record value changes in
accounts valued manually, such as managed portfolios or private equity
investments. Represent the investment as a balance account in its reporting
currency, tracking its total reported monetary value rather than individual
units.

Set **Tracking Method** to **Total Value** in the account editor for these
accounts. The default **Individual Units** groups ordinary accounts by currency,
cryptocurrency, or security symbol (across trade currencies). In the Asset Class
view, Total Value groups the entire account return under **Total Value
Accounts** within its assigned asset class, combining recorded performance and
calculated FX gains/losses when its currency differs from the book's reference
currency. Account Structure retains the account's physical group hierarchy.
Existing accounts default to Individual Units; explicitly update manually valued
accounts. Tracking Method remains editable after bookings exist and applies to
all historical Report/History periods. It changes reporting placement without
changing valuation, cash-flow eligibility, or gain/loss calculations. Only
currency-denominated balance accounts support Total Value.

The persisted `TOTAL_PORTFOLIO_VALUE` tracking method and `managed-portfolios`
investment-group key remain internal compatibility identifiers, preserving
existing Report drill paths and History selections.

Record contributions and withdrawals as transfers between the portfolio and the
funding or receiving account. When a new portfolio statement arrives, calculate:

**adjustment = reported value − balance after contributions and withdrawals**

Book that adjustment against Gain/Loss in a simple transaction with exactly two
bookings in the same currency on the statement date:

- A gain increases the portfolio balance and credits Gain/Loss (negative raw
  equity booking).
- A loss decreases the portfolio balance and debits Gain/Loss (positive raw
  equity booking).

For example, a CHF 50,000 portfolio receiving a CHF 250 contribution has a
pre-adjustment balance of CHF 50,250. A statement value of CHF 50,850 requires a
CHF 600 gain. If a subsequent CHF 1,000 withdrawal reduces that balance to CHF
49,850 and the next statement reports CHF 49,500, book a CHF 350 loss. Cash
flows themselves are transfers, not investment performance.

Individual security and cryptocurrency holdings already produce calculated
gains/losses through automatic valuation and holding calculations. Do not also
book their calculated value changes explicitly; that would count performance
twice. The Gain/Loss account is not intended for routine cash rounding
adjustments. Reports and History attribute explicit gains/losses to the
corresponding manually valued account separately from calculated holding
results.

## Ledger Page Pattern

The account ledger (`src/routes/$accountBookId/$accountId/index.tsx`) shows all
bookings for a single account in chronological order. The parent
`src/routes/$accountBookId/$accountId.tsx` route acts as a shared layout/loader
for ledger child routes.

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

## Contextual Grid Bulk Actions

Show a bulk-action toolbar only while at least one row is selected. Include the
affected count, relevant selection actions, and **Clear Selection**. Do not show
zero-selection status text or disabled bulk buttons before selection. Where
layout stability matters, replace same-height instruction or utility content
with the selection toolbar. Keep persistent mode controls and history actions,
such as **Done**, separate from selection actions. Apply this pattern to all
grids, including account management and transaction lists.

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

`src/components/transaction-editor/edit-transaction-modal.tsx` handles
create/edit of transactions with split bookings:

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
(`src/routes/$accountBookId/$accountId.tsx`).

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
`src/shared/account-utils.ts` produces these strings. Callers must guard that
`unit` is set before calling it.

For securities, unit identity intentionally uses only `symbol`. `tradeCurrency`
is required for pricing and valuation flows, but it does not define the booking
unit identity.

## AG Grid Column Types

Defined in `src/components/grid/column-types.tsx`:

- `FORMATTED_NUMERIC_COLUMN` — right-aligned, active user-locale number
  formatting with unit-aware display precision
- `SELECT_COLUMN` — searchable dropdown editor
- `TEXT_COLUMN` — text input editor
- `DATE_COLUMN` — date input with min/max constraints from context

## AG Grid Column Alignment

- Right-align date and numeric values to improve vertical scanning in ledger and
  modal grids.
- `DATE_COLUMN` and `FORMATTED_NUMERIC_COLUMN` include right-aligned header and
  cell classes by default.

## AG Grid Context Pattern

- Register `LocaleModule` centrally. `DataGrid` applies the shared UI text from
  `grid/grid-locale.ts` and merges page-specific `localeText` overrides, such as
  statement-import inclusion instructions, on top. Follow the capitalization
  guidelines when adding either kind of text.

Grids pass a context object to cell renderers and editors containing helper
data, form references, and callbacks.

## AG Grid Column Filters

Columns use AG Grid's built-in filter UI (not URL search params):

- `filter: "agTextColumnFilter"` — text contains/starts-with filter
- `filter: "agSetColumnFilter"` — searchable checkbox filter for categorical
  values such as currencies/symbols, tracking methods, and valuation providers,
  outcomes, and request reasons
- `filter: "agNumberColumnFilter"` — numeric comparison filter
- `filter: true` — default filter for the column type
- `filter: false` — explicitly disable filtering on a column (e.g. actions
  column)

Use explicit filter types for categorical columns rather than relying on
`filter: true`. Keep names, descriptions, and composite report hierarchy/name
columns as text filters. Preserve deliberately disabled filters.

Asset Class and Account Group use native set-filter trees. Values and paths use
entity IDs, with names formatted only for display, so duplicate names and names
matching special labels remain distinct. Branch checkboxes include descendants.
When a node has children, direct assignments appear beneath it as
`Directly Assigned`. Choices come from loaded accounts, retaining their
hierarchy ancestors; unused branches and blank group-summary values are omitted.
Account Group uses the original persisted hierarchy even in the Asset Class view
and for archived accounts. Accounts outside groups have a `Top Level` entry.

`Unclassified` is an explicit root entry for unassigned asset classes. `Mixed`
is a root entry for Asset Class and Tracking Method when the displayed tree
contains heterogeneous groups. An account matches `Mixed` when any displayed
ancestor has a mixed summary for that dimension, computed from the complete
loaded presentation before column filtering. Group and heading rows have no
selectable categorical values; matching account descendants retain their
ancestors for context. Selections within a column combine with OR; columns
combine with AND. For example, `Mixed` plus `USD` shows only USD accounts in
mixed groups. Name filtering alone retains the normal group-and-descendant
behavior. Display summaries and pinned totals continue to describe the full
loaded data.

Keep filter callbacks stable when rows refresh. Refresh supplied options after
row updates, preserving selected keys that still exist. Shared hierarchy and
special-key helpers live in `components/grid/set-filter.ts`; account filter
membership is presentation-only and does not change server data.

## AG Grid Theme Synchronization

`AgThemeModeSynchronizer` (in `__root.tsx`) listens to
`useComputedColorScheme()` and sets `data-ag-theme-mode` on `documentElement`.
The AG Grid Quartz theme responds to this attribute to switch between light and
dark mode. AG Grid theme config is in `src/components/grid/grid-theme.tsx`.

## Hierarchy Organize Mode

Accounts, Categories, and Asset Classes share the organizer in
`src/components/hierarchy-organize` and structural helpers in
`src/shared/hierarchy-organize`. Domain planners supply account/category rules
and asset-class validation; Cash Account propagation remains in the account
planner.

Categories and Asset Classes open directly into one drag-enabled hierarchy grid.
They have no Organize button, Organizing badge, Done button, alternate grid, or
mode-entry history state. Creation buttons stay available, including on empty
pages. Direct row icons appear on whole-row hover and keyboard focus. The
management presentation extends the organizer with editor/child callbacks and
supplemental columns; Account List keeps its separate mode unchanged.

Categories show the selected Income or Expenses hierarchy. Tabs preserve the
URL-backed Show Archived setting and clear selection/dialogs when switching
hierarchy. Show Archived sits beside the tabs, defaults off on fresh URLs, and
filters real persisted rows without virtual Archived branches. Selection moves
complete subtrees, including hidden archived descendants. Category leaf
double-click opens its ledger. Existing lifecycle rules apply, including
archiving nonzero-balance categories. Expansion survives visibility changes.

Asset Classes retains direct assignment counts and explanatory copy. Every class
can contain children. It has no Type/Status columns, archive actions, or Show
Archived control. Delete retains replacement class/Unclassified selection and
child restrictions. Structural moves preserve assignments.

Management editors optionally share the organizer submission controller. While
an editor or confirmation is open, block conflicting actions and dragging. While
a mutation or recovery request is pending, queue navigation. After a confirmed
create/edit, close the editor and refresh canonical hierarchy and editor
metadata before more operations. Preserve expansion, prune selection, and reveal
the affected row, including after read-only recovery. Never replay a confirmed
create, edit, or deletion to recover from a failed refresh.

### Shared Interaction

On Account List, **Organize** switches the page to a compact, separate
`DataGrid` while keeping the normal grid mounted, preserving its columns,
filters, scrolling, and expansion. Entry loads one fresh structural snapshot
using the global progress bar while the normal grid remains visible. Activate
only after success; on failure retain the financial grid with retry feedback.
Hide the financial grid while organizing. **Done** returns to it. On Accounts,
Organize is available only under Account Structure grouping, not Asset Class
grouping. Changing grouping while entry is loading cancels that entry attempt
and releases its loading state. The Group By control is hidden while organizing;
Done restores the financial grid.

Account List Organize is represented by `organize=true` in the Accounts URL.
Entering pushes one browser-history entry before loading, so Back exits even
during loading and Forward reopens a fresh session. Done returns to the verified
normal same-page origin or replaces a directly visited Organize URL. Loading
retries and saved moves add no history entries. During movement, lifecycle
mutations, and recovery requests, wait for the request to settle before
continuing the first queued navigation attempt. There is no unsaved-changes
confirmation for a settled organizer. Organize has no Undo or Redo; Back never
reverses a change, and Forward never replays one. Exiting clears selection,
visibility, expansion, and dialogs; reentry uses defaults. See
[Routing](routing.md) for return-target rules.

On Accounts, keep **Accounts** as the heading with an **Organizing** badge and
standard header spacing, without a mode-specific background. Use a large
Organizing badge beside the heading. **Done** replaces Organize in the first
slot of the same right-aligned header toolbar, followed by Add Group and Add
Account. Reserve Organize's intrinsic width in both modes so the mode control
and creation actions stay in place. Selection actions appear only after
selection, replacing the instruction row without shifting the grid. Routine
drag/save feedback shares that row, with no separate empty status line. Keep
routine feedback on one line, retaining full text for assistive technology and
hover, so long drag previews cannot shift the grid. Use the normal header and
grid spacing; avoid standalone loading spinners. Use global progress for initial
hierarchy loading and recovery, and shared local feedback for mutations.
Announce mode entry and movement results accessibly.

Organize checkboxes select real accounts or groups themselves, including empty
groups. Selected descendants of a selected group are normalized out of the move;
the complete subtree travels intact, including archived descendants. This
selection is separate from the normal account-property bulk selection and starts
empty on entry. Account List keeps Add Account and Add Group in its Organize
header beside Done, and on active group rows with the parent preselected.
Editing and property bulk actions remain hidden while organizing. Creation
shares the organizer submission controller, refreshes hierarchy and editor
metadata after commit, and reveals the new row. Open editors block conflicting
actions; pending submissions and recovery queue navigation. A failed refresh
never replays a committed creation. Keep existing editors mounted across mode
changes through browser history; finish normal editor submissions/recovery
before switching controllers. Retained edits share the organizer controller,
block conflicting actions, and refresh canonical hierarchy after saving. Row
actions use an unlabeled, fixed-width, right-pinned column with shared
hover/focus styling: Move To (`IconArrowsMove`, blue), Add Account and Add Group
(`IconPlus`, blue) on active groups, Archive (`IconArchive`, yellow) or
Unarchive (`IconArchiveOff`, blue), then Delete (`IconTrash`, red). Use
accessible labels identifying the row and disabled-reason tooltips.
Archive/delete reuse the shared confirmation dialogs; unarchive runs directly.
Existing eligibility remains authoritative: groups with active children cannot
be archived, nonempty groups cannot be deleted, booked accounts cannot be
deleted, and archived ancestors prevent unarchiving. Row lifecycle actions
affect only that row.

Account List Organize also offers Archive and Delete beside Move To in its
selection toolbar. Lifecycle actions use every explicitly selected row; movement
still normalizes selected descendants out of its subtree roots. Display counts
for the explicit selection. A shared batch planner evaluates prerequisites
against the projected hierarchy and provides the same availability and operation
order to the toolbar, submissions, retries, and server mutations. Pure account
lifecycle rules live in `src/shared/account-tree-rules.ts` for server/browser
reuse.

Selected rows can satisfy each other's hierarchy prerequisites. Unarchive runs
ancestors before descendants and requires every blocking archived ancestor to be
selected. Archive runs descendants before ancestors and requires all active
children needed to archive selected groups to be selected; already archived,
unselected children do not block it. Delete runs descendants before ancestors
and requires all accounts and subgroups, including archived descendants, of a
selected group to be explicitly selected. Missing prerequisites disable the
whole batch with an accessible explanation naming the blocking row. Nonzero
balances still prevent account archive, and bookings still prevent account
deletion. No ancestors or descendants are added automatically.

When all explicitly selected accounts/groups are archived, replace Archive with
Unarchive (blue), based on status rather than eligibility. Otherwise show
Archive; its selected rows must all be active. Unarchive runs directly, like row
Unarchive; Archive/Delete confirm the selected names and account/group counts
once. The server reads current metadata and validates the complete
balance-hierarchy batch under the book lock before writing in the planned order,
with rollback on any failure and one cache invalidation. Single-row eligibility
rules remain unchanged. Bulk lifecycle actions are exclusive to Account List
Organize.

Default Account List row menus offer Move To for real accounts and groups,
including archived rows and accounts displayed under Asset Class grouping.
Virtual headings and totals have no action. Open the shared move dialog
immediately to block conflicting page actions during its fresh structural read.
Use global progress during loading and offer load retry/cancellation inside the
dialog. Do not change modes or the URL; use persisted parents and include
archived destinations for archived targets. The default property bulk toolbar
does not offer movement. In row menus, Edit precedes Move To; both use the
default neutral menu styling.

Organize displays real persisted parents and manual order, including archived
items, without virtual Archived branches. Archived rows have a status badge and
subdued readable styling. **Show Archived** starts disabled on each entry and
affects visibility only. Turning it off deselects hidden archived rows while
retaining active selections; selected groups still move every descendant. Keep
expansion across toggles. Freeze the toggle during dragging, an open Move To
dialog, and in-flight operations. The normal financial grid retains its virtual
Archived presentation.

Mixed active/archived roots can use all placement options where the resulting
hierarchy is valid. Before/After means immediately beside the real anchor in the
complete sibling order; First/Last uses the complete list's boundaries, even
with archived items hidden. Untouched siblings retain their relative order.
Dialog destinations and anchors follow archived visibility; previews include
archived-descendant counts. Preserve the visibility choice after all operations,
focus a visible affected item or ancestor, and announce hidden results. Offer
Show Archived when the active-only tree is empty.

Drag handles provide before/after insertion indicators and inside-group drop
highlighting. Real-row handles remain visible and reserve their layout space
during dragging, saving, and recovery; blocked handles are dimmed and cannot
start a drag. Keep grid configuration references stable as drag hints update.
Rows remain stationary during dragging; hovering over a collapsed branch for 500
ms expands it. Escape or dropping outside a valid destination cancels. The
keyboard-accessible **Move To…** dialog uses the shared searchable
`GroupTreeSelect` for destinations, with an explicit Top Level option, real
group IDs, saved sibling order, and full-path search. Use a labeled segmented
control for First/Last/Before/After placement; disable Before/After when no
compatible anchors exist. The Sibling field remains a flat searchable choice
within one parent. Top Level remains available in that dialog and by dropping
before/after a compatible root row; there is no separate Top Level drop area.
Organize displays saved manual order, without search or sorting in the grid.
Null or tied sort orders use a fixed `en-US` fallback collation and ID
tie-breaker in both browser planning and server persistence.

Account moves inherit existing parent Cash Account rules, including subtree
propagation and non-currency restrictions. Moving to Top Level preserves flags;
reordering does not change them. Both movement controls preview the destination
and any Cash Account changes. Success reveals the moved items and announces the
result.

Each move autosaves through an authorized serialized book mutation. A coherent
scope-specific hierarchy metadata snapshot supplies a version checked under the
book lock before moving, preventing stale writes. Unrelated booking and balance
changes do not affect that version. There is no Undo, Redo, or stored undo
history.

Snapshots include fresh action availability separately from hierarchy
versioning. Use existing rule helpers and booking metadata without fetching
financial reporting data. Lifecycle mutations reuse the existing authorized
server functions and revalidate eligibility at submission. After a committed
action, invalidate reporting data and refresh the canonical organizer snapshot
before allowing more operations. Preserve expansion and visibility; prune
unavailable or hidden selections, focus a visible ancestor/neighbor when a row
disappears, and announce hidden archive results without enabling Show Archived
automatically.

One submission controller covers movement, lifecycle confirmations, direct
unarchive, and recovery. Shared confirmation dialogs optionally accept this
controller; standalone callers retain their internal controller. While pending,
disable movement, row mutations, Show Archived, and Done, and queue navigation.
Failed moves restore confirmed data and refresh choices using shared mutation
feedback. While Move To is open, show this feedback and its recovery controls
inside the dialog; disable submission until recovery succeeds. Busy retries
submit the current dialog choices and close after success. Only confirmed busy
rollbacks offer an explicit retry while the hierarchy version and target
eligibility remain valid. Uncertain network outcomes require a successful
refresh before another operation. A confirmed lifecycle commit is never
resubmitted to recover a failed refresh; retain the committed state and recover
by reading canonical data. Financial fields are never accepted by movement APIs.

## Node Type Mixing in Tree Data

The `getAccountTreeData` server function returns a single flat array where each
row has a `nodeType` field (`"account"` or `"accountGroup"`). AG Grid's tree
data groups them hierarchically. Fields that don't apply to a node type are
`null`.

## FormattedNumberInput

`src/components/controls/formatted-number-input.tsx` wraps Mantine's
`NumberInput` using `Intl.NumberFormat` to extract locale-specific
thousand/decimal separators. An explicit `locale` prop takes precedence;
otherwise the input uses the active user locale from `useUserLocale()`. The
context fallback is `DEFAULT_USER_LOCALE` (`en-US`) from `src/user-locale.ts`.

Precision behavior:

- **Display contexts** enforce unit-aware precision via
  `src/shared/unit-format.ts`:
  - currencies: Unicode CLDR 48.2 standard display digits (with fallback to
    `2`), covering current and historical codes in `src/currencies.ts`; for
    example, COP and KRW use `0`, CHF uses `2`, KWD uses `3`, and CLF uses `4`
  - cryptocurrencies: Kraken `display_decimals` (with fallback to `8`)
  - securities: `0` decimals
- **Data-entry contexts** do not enforce decimal caps, so users can enter and
  review full decimal precision from the stored numeric value.

Currency display digits are pinned in
`src/shared/unit-format-currency-decimals.ts` so browser/runtime CLDR versions
do not change display precision. Cash digits and cash rounding increments are
not applied. Display formatting does not change stored amounts or calculation
precision.

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
- AG Grid theme in `src/components/grid/grid-theme.tsx` maps Mantine CSS
  variables to AG Grid theming
- PostCSS configured with `postcss-preset-mantine` and `postcss-simple-vars`

### AG Grid 36 containers and diagnostics

AG Grid 36 uses `.ag-grid-viewport` for native horizontal and vertical
scrolling. Rendered body rows are direct children of
`.ag-grid-scrolling-container`, with scrolling, left-pinned, and right-pinned
cell sections inside each row. Pinned bottom rows are in
`.ag-grid-pinned-bottom-rows`. Avoid selectors using the old center-column,
pinned-column, or floating-bottom containers. Scope row actions to their row and
modal editing locators to their dialog. Transactions list and bookings grids
have independent row indices; scope booking queries to the named details region
or drawer. Both grids use constrained heights with independent scrolling.
Loading and empty overlays are siblings of the viewport in v36; do not depend on
them being viewport children.

`ensureGridModulesRegistered` supplies the same selective feature modules in the
application and Storybook. Development registers `ValidationModule` with
`showOverlayOn: []`, retaining console messages without an intrusive diagnostic
overlay. Production omits that module. Cashfolio's charts remain standalone; no
Integrated Charts or sparkline module is registered. Expanded account groups
retain their existing session-storage keys and JSON array of group IDs.
`RowAutoHeightModule` supports wrapping account paths in Report tables; retain
it when updating the selective module list.

## Rejected book mutations

Book-mutation forms opt into
`useDialogSubmitState({ captureErrors: true, onRefreshConstraints })` and render
`MutationSubmitFeedback`. Existing callers that do not opt into capture still
receive thrown errors. The hook prevents duplicate submissions, clears timers on
completion/unmount, and exposes waiting feedback after two seconds: "Waiting for
another change to finish…".

Rejected saves leave the form and draft mounted. Recovery uses authorized page
reads through `useRefreshedMutationData` to refresh choices, group rules and the
book's earliest booking date without router navigation or form reset. Account
and group forms initialize once per open/edit session. Unavailable selections
retain their IDs and display an explanation; the user must correct them under
the current validation rules. Refresh failures appear separately from save
errors, with a manual **Refresh Choices** action.

Statement-import recovery also reloads existing bookings and recalculates match
markers and balance previews. It retains draft edits and inclusion decisions,
even when new matches are discovered, and revalidates against refreshed account
choices and start dates. Review remains open until a successful import.

Hierarchy Organize uses the same submission feedback. Failed moves restore the
confirmed hierarchy and refresh canonical choices. Only confirmed busy rollbacks
allow explicit retry while the hierarchy version and eligibility remain valid.
Uncertain outcomes require refresh before another action. Movement is disabled
during saves and recovery; committed lifecycle actions are never resubmitted.

Direct unarchive on the accounts page and ledger uses `useUnarchiveMutation`.
Page-level feedback names the affected account/group, refreshes eligibility, and
keeps other open drafts mounted. Pending actions cannot be submitted twice. Busy
retries are disabled when the refreshed target is no longer eligible.

Only the confirmed busy-book rollback offers **Try Again**. A failed network
request can have an uncertain save outcome; feedback asks the user to refresh
and check saved data before submitting again. The client never automatically
retries a mutation. Server-side retries apply only to fully rolled-back database
conflicts (see [server functions](server-functions.md)). Optimistic edit
versions and live cross-tab synchronization remain separate follow-ups.

## Balance-based Report and History Allocation

Assets include positive period-end account balances; Liabilities include the
absolute values of negative balances, regardless of the stored account type. The
Account management uses a stable balance-account hierarchy. Report allocation
tables/charts and History totals use the same rule. An overdrawn asset account
appears under Liabilities and an overpaid liability account appears under
Assets, retaining its original group path and ledger link. A group can appear on
both sides, with only the relevant accounts on each side. Category roles,
cash-flow inclusion flags, and signed ledger/import conventions do not change.

History's Assets and Liabilities nodes are selectable aggregate totals without
children. Net Worth contains the complete Balance Account hierarchy, including
archived accounts, zero-only accounts, and empty groups. Account selections show
signed balances across zero; groups sum their descendants' signed balances. The
same scope applies to the opening baseline. Tree nodes, selected labels, chart
headings, series, and tooltips use existing account/group names without a
"Balance" suffix; full paths remain searchable to disambiguate duplicate names.
Real account selections support double-clicking a period to open its ledger.
Groups, virtual accounts, and the opening baseline do not have ledger
navigation.

Assets, Liabilities, and Net Worth History charts omit legends. Net Worth uses a
single continuous signed area series, segmented at zero with green positive
regions and red negative regions. Zero balances remain real chart points rather
than gaps. All balance charts hide permanent markers, regardless of whether the
scope supports ledger navigation. Hover/focus highlighting retains the
corresponding sign color (green at zero), tooltips, and real-account period
double-click navigation. Tooltip symbols match the chart colors: green for
Assets, red for Liabilities, and the hovered balance's sign color for Net Worth
(green at zero). Storybook stories can set `parameters.colorScheme` to `light`
or `dark` to force the Mantine and grid themes consistently for visual
verification.

Legacy History links selecting an account/group under Assets or Liabilities move
that selection to Net Worth. Explicit `netWorthScope` takes precedence;
aggregate links remain unchanged, inactive legacy scope parameters are
discarded, and deleted/invalid scopes fall back to Net Worth total. Canonical
URLs use `netWorthScope` and remove `assetScope`/`liabilityScope`.

## Calendar Dates and Temporal

Import Temporal from `src/shared/temporal.ts` for calendar logic on both the
server and browser. The explicit `temporal-polyfill` entry point uses native
Temporal on Node 26 and supporting browsers, with a synchronous fallback for
Safari. It does not patch global objects or require client bootstrap ordering.
Use the package's exported types rather than adding global Temporal types.

Use `Temporal.PlainDate` for accounting days, `PlainYearMonth` or calendar
addition for periods, and `Instant` for actual timestamps. The internal
`temporal-adapters.ts` module converts existing `Date` boundaries. Prisma,
server responses, charts, and Mantine inputs retain their Date/string contracts.
Existing external month fields remain zero-based; Temporal months are one-based.

Accounting dates represent UTC days. DateInput values represent local calendar
days and must pass through the existing shared date input adapters before
submission. Preserve canonical UTC-midnight values during normalization. Reject
invalid dates explicitly rather than allowing Temporal's default constrained
overflow to change user input. Continue formatting Date boundary values with
`Intl.DateTimeFormat`; native Intl cannot format fallback Temporal objects.
Elapsed session timeouts and retention windows remain elapsed durations rather
than local calendar days.

The app no longer directly depends on date-fns. Date validation, comparison,
formatting, and arithmetic use the shared Temporal-backed helpers.

## Classification Management

Settings → Asset Classes exposes the Asset Class tree through the shared
`DataGrid` with native tree data. The tab and document title are Asset Classes;
the page has no additional visible headings. Class identities and the generic
classification model remain unchanged. Users can create roots and children,
rename, and change parents in the editor. The default hierarchy editor supports
subtree moves and sibling ordering through dragging and Move To. The grid starts
fully expanded and retains expansion state across data refreshes using stable
class IDs. Siblings retain their configured order; sorting and filtering are
disabled. The flexible name column and direct active/archived assignment counts
are resizable, and row actions are pinned on the right using the shared
row-hover styling. The grid handles scrolling and its empty state. The scheme is
protected; all default nodes remain editable. Parent selectors exclude the
edited class and descendants, with the same checks repeated on the server. Names
follow existing sibling-name validation.

Parents cannot be deleted until their children are moved or deleted. Leaf
deletion shows direct active/archived assignment counts and requires choosing a
replacement class or Unclassified. Submission uses shared waiting, error, and
refresh feedback, retaining drafts on failure. All classification changes apply
to historical reports. Additional classification schemes and percentage splits
are deferred.

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
directly; Node 24 loads them through native type stripping without a build step
or custom loader. Use type-only imports for ESLint/AST types and erasable
TypeScript syntax so direct loading remains supported. Type stripping does not
check types; the normal `typecheck` command does.

## Shared Component Organization

Shared UI code lives under `src/components/`, grouped by the feature or UI
responsibility that owns it:

| Folder                | Responsibility                                                         |
| --------------------- | ---------------------------------------------------------------------- |
| `account-editor/`     | Account/group editing, form values, and cash-flow inclusion form rules |
| `account-tree/`       | Account/group tree selection, row actions, and sibling reordering      |
| `transaction-editor/` | Split transaction editing, booking columns, validation, and form state |
| `transactions/`       | Simple transaction editing, rebooking, bulk actions, and dialog copy   |
| `grid/`               | DataGrid, column editors, filters, locale, and grid theme/CSS          |
| `navigation/`         | Router link wrappers, breadcrumbs, and navigation progress             |
| `layout/`             | Page shells and page headers                                           |
| `dialogs/`            | Confirmations and shared mutation feedback                             |
| `controls/`           | Number inputs, unit selectors, and split buttons                       |
| `testing/`            | Fixtures shared by component stories                                   |

Colocate tests and stories with their implementation. Import modules directly
from their owning folder; do not add root-level compatibility shims or general
component barrel files. Keep route-specific UI beside its owning route, and keep
existing Storybook titles and story export names stable when moving files.

## Mantine

- **Mantine 9** for all UI components, forms (`@mantine/form`), and theming
- **AG Grid Enterprise** wrapped in `src/components/grid/data-grid.tsx` with
  tree data support
- Use `LinkAnchor` from `src/components/navigation/link-anchor.tsx` for in-app
  links that should look like Mantine anchors. Avoid `Anchor` +
  `component={Link}` with casts.
- Use `LinkButton` from `src/components/navigation/link-button.tsx` when a
  navigation control should look like a Mantine button.
- Use `LinkTab` from `src/components/navigation/link-tab.tsx` for tab-like
  navigation that changes route/search state.

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
`/api/my-account` retain the provider's terminology. The legacy
`/account/delete` URL is a compatibility exception, not a pattern for new
routes; see [self-service deletion](server-functions.md#auth-and-authorization).

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
  the accounts list `tab`/`mode`), render it as a TanStack link (an `<a>`), not
  as a button with an `onClick` navigation handler.
- Use:
  - `LinkAnchor` for text links/breadcrumbs
  - `LinkButton` for button-styled navigation actions (for example Accounts or
    Report)
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

The account editor groups identity fields first, followed by unit details and
the Cash Account flag, then Opening Balance beside Asset Class. Columns stack at
narrow viewport widths. Opening Balance keeps concise sign guidance below the
input; the detailed Asset Class explanation is available in a help popover.
Statement Import Settings is collapsed at the start of each create/edit session.
Its CSV editor stays mounted so collapsing it preserves drafts, and submitting
an invalid CSV format opens the section to expose its validation error.

The account editor offers an **Asset Class** selector for assets and
liabilities, separate from Unit and valuation configuration. It remains editable
for booked and archived accounts while instrument identity stays locked.
Unclassified is the default; no classification is suggested or inferred from
Unit, cash flags, groups, or other fields. Users can choose any class or clear
back to Unclassified. Income, expense, and system equity accounts do not expose
this selector.

Accounts supports checkbox selection with the **Set Asset Class** toolbar
action. Balance-account leaves, real groups, and virtual Archived groups show
checkboxes. Group checkboxes select matching descendant accounts, including
nested and archived accounts regardless of expansion, using AG Grid's native
filtered-descendant selection. Empty groups have disabled checkboxes; totals and
categories are excluded. Groups show native checked/indeterminate states, and
individual accounts can be excluded from a selection. The toolbar counts
accounts, and requests contain only account IDs.

Filtered-out selections are removed, header select-all uses the filtered account
set, and clearing a filter does not add accounts to an existing selection.
Ordinary cell clicks retain their existing behavior. Selection resets when
switching account books or management contexts. The dialog freezes selected
account IDs when opened, shows total and archived counts, and requires an
explicit asset class or Unclassified. Applying replaces existing classifications
for the selected accounts and all historical Report/History periods. Errors
retain the choice for retry. Success clears selection and refreshes data. Groups
do not store a class or provide inheritance.

Assets and liabilities show classification beside the type and unit badges in
the ledger header. The gray pill uses the light variant for a selected class and
the outline variant for Unclassified, including on archived accounts. Its title
includes the field name and full label. Equity accounts have no pill.

The current classification applies to all historical periods in Report and
History. Calculated and recorded gains/losses are grouped by Asset Class then
Account; recorded adjustments use their counterpart financial account's class.
Changing classification does not change amounts or valuation. Accounting
`AccountType.EQUITY` is unrelated to the Equities asset class.

`src/components/account-editor/edit-account-modal.tsx` remains the public
account-editor entry point, including its existing type and form-value exports.
Its implementation lives in `src/components/account-editor/`:

- `types.ts`: input props, initial values, and form-value contracts
- `values.ts`: initial-value creation, form transforms, and CSV JSON validation
- `controller.ts`: form validation, edit-session initialization, cash
  eligibility, submission, and close guards
- `view.tsx`: the account modal render tree
- `asset-class-field.tsx`: classification input and explanatory help
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

- Always wrap `ActionIcon` components in a `Tooltip` describing the action (e.g.
  "Edit", "Delete")
- Action availability behavior is defined in `Action Availability Pattern`.
- Standard non-destructive row actions use the normal action color
  (`color="blue"`). Use semantic colors for destructive actions or
  special-impact actions such as archive.
- Tooltip `openDelay` is configured globally in `src/theme.ts` (default 500ms) —
  do not override per-instance unless necessary

## Top Page Header Pattern

- Use `TopPageHeader` (`src/components/layout/top-page-header.tsx`) for
  page-level headers on account-book routes.
- Keep layout props centralized in `TopPageHeader`: `mb="lg"`,
  `justify="space-between"`, `align="center"`, `mih={36}`.
- Pass heading content through `heading`, optional badges/chips through
  `headingAccessory`, and page actions through `actions`.
- For hierarchical subpages, pass `PageBreadcrumbs`
  (`src/components/navigation/page-breadcrumbs.tsx`) as the `heading`.
- Breadcrumb parent items are links and the current page item is plain text. Do
  not duplicate breadcrumb navigation with a top-right back button.

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

- Income, expense, and allocation bars use the automatic category palette, like
  donut sectors, with a bottom legend naming the categories at the current drill
  level. Only Cash Flow bars opt into sign-based colors: green for positive
  amounts, red for negative amounts, and gray for zero; they do not show a
  category legend.
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
  - Expense/Income charts (`Donut`, `Bar`)
  - Gains/Losses chart (`Waterfall`)
- Double-clicking a drillable chart node drills into its children.
- Leaves have no further hierarchy to drill into. Supported account leaves can
  navigate to a ledger or gain/loss reconciliation for the selected period.
- Gains/Losses uses Asset Class → Account. Account metadata drives navigation
  from chart and table leaves to the unified explanation, including calculated
  holdings, recorded adjustments, and supported synthetic amounts. Do not infer
  a destination from node-ID prefixes.
- Asset-class nodes drill into their accounts in charts and expand/collapse in
  tables; they do not open a ledger.
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
  with a 320px minimum width. Row actions are frozen on the right at 145px. When
  columns no longer fit, scroll horizontally inside the grid to reach the middle
  columns. In both category tabs, `Name` is unpinned and flexes to fill the
  space beside the row actions, retaining its 320px minimum width. These layouts
  also apply when archived items are visible. AG Grid automatically unpins
  columns when the viewport is too narrow to accommodate the frozen columns.
- G/L figures use the order `Total`, `Realised`, `Unrealised` in the Accounts
  grid, account summary, calculation drawer, and period reconciliation cards.
- The Accounts scope (`BALANCE`) renders `Name`, `Ccy./Symbol`, `Balance`,
  `Balance (<referenceCurrency>)`, `Asset Class`, G/L, and row actions in that
  order.
- `Ccy./Symbol` starts at 180px and can be resized and filtered. It shows
  foreign currency codes, cryptocurrency tickers, or security symbols; security
  trade currencies are omitted. Group, virtual Archived, and total rows stay
  blank.
- `Asset Class` follows the Balance columns, starts at 220px, and can be
  resized. Its text filter and tooltip use the full display label. Unset
  accounts show muted `Unclassified`. Real groups and virtual Archived groups
  summarize all descendant accounts, including archived accounts, regardless of
  collapse or grid filters: one distinct value shows its label; multiple values
  show `Mixed`. Unclassified counts as a distinct value, so all-unclassified
  groups show muted `Unclassified`, and classified plus unclassified shows
  `Mixed` in normal text. Empty subgroups do not contribute a value; groups
  without descendant accounts and the total row stay blank. Group summaries are
  read-only. The column preserves the existing sibling ordering and grid-only
  horizontal scrolling.
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
  `ActionIcon.disabled`.
- The tooltip label should use the disabled reason when unavailable, otherwise a
  default action label.
- Enforce rules server-side as well; UI availability is an affordance, not an
  authorization check.

## Data Grid Actions Column

- Use `cellClass: "actions-cell"` so icons only appear on whole-row hover
  (styled in `src/components/grid/grid-theme.css`). This must work for pinned
  actions columns too; rely on AG Grid's row-hover state rather than hovering
  only the actions cell.
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
accounts valued manually, such as managed or discretionary portfolios. Represent
the portfolio as a balance account in its reporting currency, tracking its total
reported monetary value rather than individual securities.

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

The account ledger exposes `Import Statement` in the account actions menu for
asset and liability accounts with complete unit metadata. The action opens a
dedicated import page. The v1 importer accepts a strict CSV with a header row,
but header names are ignored. The first six columns must be ordered as: `date`,
`amount`, `original amount`, `original currency`, `exchange rate`, and
`description`. Comma and semicolon delimiters are supported, and extra trailing
columns are ignored. The fifth `exchange rate` column is reserved for source CSV
compatibility but ignored by the importer.

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
  transactions. Debits and credits must balance only when all bookings share the
  same unit identifier.

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
- `filter: "agNumberColumnFilter"` — numeric comparison filter
- `filter: true` — default filter for the column type
- `filter: false` — explicitly disable filtering on a column (e.g. actions
  column)

## AG Grid Theme Synchronization

`AgThemeModeSynchronizer` (in `__root.tsx`) listens to
`useComputedColorScheme()` and sets `data-ag-theme-mode` on `documentElement`.
The AG Grid Quartz theme responds to this attribute to switch between light and
dark mode. AG Grid theme config is in `src/components/grid/grid-theme.tsx`.

## Sibling Reorder Pattern

- The main accounts tree does not use row dragging.
- Reorder action availability follows the generic `Action Availability Pattern`.
- Availability is based on sibling count under the same parent.
- Clicking the action opens `ReorderGroupChildrenModal`
  (`src/components/account-tree/reorder-group-children-modal.tsx`) and shows all
  siblings (accounts and groups) of the clicked row.
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

`src/components/controls/formatted-number-input.tsx` wraps Mantine's
`NumberInput` using `Intl.NumberFormat` to extract locale-specific
thousand/decimal separators (defaults to `en-US`).

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

Sibling reorder uses the same submission feedback, but restores the last
confirmed order on rejection rather than retaining an unsaved arrangement. AG
Grid remounts to undo its internally managed drag order, then an authorized
refresh reloads saved siblings. A busy rollback retains the attempted order for
explicit retry only while the sibling membership is unchanged; otherwise the
user must drag the refreshed rows again. Dragging is disabled during saves and
refreshes.

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
tables/charts and History totals/scopes use the same rule. An overdrawn asset
account appears under Liabilities and an overpaid liability account appears
under Assets, retaining its original group path and ledger link. A group can
appear on both sides, with only the relevant accounts on each side. History
scopes show zero for dates on the opposite side. Category roles, cash-flow
inclusion flags, and signed ledger/import conventions do not change.

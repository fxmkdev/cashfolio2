# Accounts and Classification

Scope: `apps/cashfolio-app2`; source paths are relative to that app.

[UI patterns](../ui-patterns.md) ·
[Architecture and ownership](../architecture.md)

## Account Editor

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

## Account Return Percentages

Accounts shows a separate **Returns Since Start** column group with **TWR** and
**MWR**. A **Return Basis** selector beside **Group By** selects **Annualized**
(the default) or **Cumulative**; the column-group title includes the selected
basis. Ledger return cards use the same selector and title. Controls wrap on
narrow screens; the Accounts selector is hidden during Organize mode and in
views without return columns. The preference is shared per book for the current
browser-tab session, including navigation between Accounts and ledgers.

Switching basis selects the existing response fields without new requests, cache
invalidation, or resetting progressive results. Refresh return cells even when
both values are null. Annualized results require at least 365 inclusive
accounting days in the effective investment span; shorter spans show a dash
explaining that cumulative returns remain available. Never substitute a
cumulative percentage under an annualized heading. Metric-specific failures
retain their explanations.

Values use the active locale and two percentage decimal places; raw fractional
values remain available for numeric sorting. Individual eligibility matches G/L,
while group/footer returns also include idle cash and archived descendants.
Group percentages are calculated from combined capital movements.

Return cells open **Return Calculation** for the account, displayed group, or
footer, with the shared grid button keyboard/mouse handling. Unavailable values
show a dash and an accessible explanation, with metric-specific diagnostics in
the drawer. Ledger return cards load independently from G/L and use their own
retry action. Calculation details distinguish reporting dates from the effective
investment span and show annualized equivalents only for spans of at least a
year. Both measures are explicitly labeled Cumulative or Annualized. All
calculation tables use `DataGrid`.

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
[Archived groups and totals](../valuation-reference-balances.md#archived-groups-and-totals).

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

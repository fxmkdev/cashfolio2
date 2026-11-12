# Grids and Hierarchies

Scope: `apps/cashfolio-app2`; source paths are relative to that app.

[UI patterns](../ui-patterns.md) ·
[Architecture and ownership](../architecture.md)

## Tables

Use **AG Grid Enterprise** through the shared `DataGrid` wrapper
(`src/components/grid/data-grid.tsx`) for all tabular UI, including small,
read-only, and modal tables. This keeps theme, locale, scrolling, resizing, and
row actions consistent. Apply this guideline when adding or changing tables;
existing tables elsewhere can be migrated in focused follow-ups.

Use native tree data for hierarchical records, with stable row IDs. Keep stored
manual ordering authoritative in hierarchy management and Organize mode. Follow
the shared column and actions-cell conventions below.

- Use `GridCellLoading` from `src/components/grid/grid-cell-loading.tsx` for
  asynchronous numeric-cell loading, including reference balances, G/L, TWR, and
  MWR. It renders the existing Mantine `dots` loader at `xs`, right-aligned and
  vertically centered within the full cell. Do not use the default spinner or
  duplicate loader markup in cell renderers.
- Supply a sentence-case accessible loading label. Keep the cell dimensions,
  existing delay/eligibility rules, and numeric placeholder alignment stable.
  For progressive tables, track completion by displayed row ID. Completed rows
  leave loading immediately, including null/inapplicable results; slow totals
  must not hold completed account rows behind a global flag. Explicitly refresh
  cells when status changes even if the numeric value remains null. Preserve
  completed rows during retries in the same context and clear them immediately
  on scope/revision changes. Show actionable errors separately. Page-level
  loading still uses the global progress bar.

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

## Contextual Grid Bulk Actions

Show a bulk-action toolbar only while at least one row is selected. Include the
affected count, relevant selection actions, and **Clear Selection**. Do not show
zero-selection status text or disabled bulk buttons before selection. Where
layout stability matters, replace same-height instruction or utility content
with the selection toolbar. Keep persistent mode controls and history actions,
such as **Done**, separate from selection actions. Apply this pattern to all
grids, including account management and transaction lists.

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
[Routing](../routing.md) for return-target rules.

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
before switching controllers, including submissions begun while initial Organize
loading is already in progress. Discard any overlapping initial read and
activate only after a fresh hierarchy/metadata read. Failed normal editors
retain their controller, draft, and feedback until saved or cancelled. Retained
edits share the organizer controller, block conflicting actions, and refresh
canonical hierarchy after saving. Row actions use an unlabeled, fixed-width,
right-pinned column with shared hover/focus styling: Move To (`IconArrowsMove`,
blue), Add Account and Add Group (`IconPlus`, blue) on active groups, Archive
(`IconArchive`, yellow) or Unarchive (`IconArchiveOff`, blue), then Delete
(`IconTrash`, red). Use accessible labels identifying the row and
disabled-reason tooltips. Archive/delete reuse the shared confirmation dialogs;
unarchive runs directly. Existing eligibility remains authoritative: groups with
active children cannot be archived, nonempty groups cannot be deleted, booked
accounts cannot be deleted, and archived ancestors prevent unarchiving. Row
lifecycle actions affect only that row.

Account List Organize also offers Archive and Delete beside Move To in its
selection toolbar. Lifecycle actions use every explicitly selected row; movement
still normalizes selected descendants out of its subtree roots. Display counts
for the explicit selection. A shared batch planner evaluates prerequisites
against the projected hierarchy and provides the same availability and operation
order to the toolbar, submissions, retries, and server mutations. Pure account
lifecycle rules live in `src/shared/accounts/account-tree-rules.ts` for
server/browser reuse.

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

## AG Grid 36 containers and diagnostics

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

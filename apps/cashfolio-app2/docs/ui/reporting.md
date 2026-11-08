# Reporting

Scope: `apps/cashfolio-app2`; source paths are relative to that app.

[UI patterns](../ui-patterns.md) ·
[Architecture and ownership](../architecture.md)

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

# Storybook Catalogue and Authoring

Storybook has three roots: **Start Here**, **Components**, and **Screens**.
Start Here introduces browsing and links to the existing UI guidelines.
Components follows shared UI responsibilities. Screens follows product areas and
keeps route-owned controls with their screen. Sidebar organization does not
change module ownership or source colocation.

## Titles and States

Use explicit, readable Title Case titles without implementation suffixes such as
`PageView`. Group stories by their owning responsibility or screen, then by
concern. For example, use `Components/Controls/Currency Select`,
`Screens/Ledger/Account Switcher`, and `Screens/Accounts/Organize/Navigation`.
Overview, Default, Create, and Edit sort first; remaining entries sort
alphabetically. Preserve existing exported story names when reorganizing.

Each component should have a representative default and applicable states such
as empty, loading, disabled, pending, and error. Prefer directly inspectable
states over requiring a long workflow to reach them. Use existing fixtures and
isolated story callbacks; do not change application APIs solely for examples.

## Regression Scenarios and Documentation

Tag smoke tests, lifecycle/history verification, implementation comparisons, and
multi-step mutation scenarios with `regression` and `!autodocs`. The manager
excludes the regression tag by default; users can clear that exclusion in the
sidebar tag filter. Do not remove the implicit `test` tag: filtering must not
reduce CI coverage. Focused interaction demonstrations remain visible; a `play`
function alone does not make a story a regression scenario.

Shared component metadata opts into `autodocs`, with a purpose/usage description
and useful prop Controls. Screen fixtures do not opt into Autodocs and have
Controls disabled. Keep one component concern per sidebar leaf. Do not render
large test matrices in Docs. Render dialogs, editors, and open drawers in
isolated Docs iframes so their portals cannot cover sibling examples. Pending
and failed-save examples opt into Docs autoplay to present their submitted
state; regression workflows stay excluded.

Input playgrounds use `useArgs` so typing and Controls edit the same value. Keep
React input state in the shared `StoryValue` wrapper, separate from Storybook
hooks, so portable browser tests also rerender after selection. Callbacks remain
observable with `fn()`. Complex JSX and fixture objects should not be exposed as
editable Controls. Persistent Pending examples use `pendingStorySubmission`;
each submission creates its own unresolved promise. Remounting discards the
pending UI. These examples' play functions submit and assert the pending state
without awaiting the unresolved submission.

## Preview Environment

The toolbar defaults to light theme, en-US, and Desktop (1280 × 900). It also
provides Tablet (768 × 1024), Mobile (390 × 844), and all supported user
locales. Mantine and AG Grid use the same effective theme; `UserLocaleProvider`
supplies the global locale. Explicit `parameters.colorScheme`, locale props, or
nested locale providers take precedence and must be explained in story
descriptions.

Define viewport choices in `parameters.viewport.options`; select an initial
viewport in `initialGlobals.viewport` or pin a story using `globals.viewport`.
Do not use legacy `defaultViewport` or `parameters.viewport.value`. Assertions
read the resolved globals. Existing specialized sizes, such as Short Desktop,
remain local to their stories.

Controls use padded canvases, screens use fullscreen canvases, and grids have
explicit bounded containers. Preserve the shared router and loading providers.

## Verification and Links

Follow the repository verification policy: use focused browser tests and local
typecheck/lint/format feedback during implementation; leave full builds,
coverage, and end-to-end runs to CI. Verify that regrouped stories remain
indexed and implicitly test-eligible, and inspect sidebar filtering, Docs,
Controls, toolbar changes, viewport dimensions, and modal portals in the
browser.

Reorganizing titles changes title-derived story IDs, external deep links, and
Chromatic story identity. Call out that migration in the PR. Do not use internal
ID overrides or change Chromatic approval policy to conceal it.

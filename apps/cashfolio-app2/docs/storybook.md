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

## Manual Browsing and Automated Scenarios

Default-visible stories wait for the user. Story setup must not automatically
click, type, hover, focus controls, select, scroll, navigate, dismiss, or
submit. A read-only play function may assert the supplied initial state. Audit
effective play functions, including story spreads, factory returns, referenced
functions, and imported helpers; absence of a literal userEvent call is not
sufficient. Normal component behavior, such as a supplied modal's focus
management and loading fixture data, remains enabled.

Automated workflows belong in separate stories tagged `regression` and
`!autodocs`, with display names ending in **Interaction Test**. Preserve their
existing export names and assertions when reorganizing. The manager excludes
regression stories initially; clear the exclusion in the sidebar tag filter to
inspect them. Never remove the implicit `test` tag: browsing filters must not
reduce CI coverage.

Define the viewing configuration first, then spread it into its interaction test
and supply the automated play function. Share args, fixtures, callbacks, and
render harnesses. Reuse one viewing example for scenarios with the same initial
UI instead of duplicating it for every workflow. When deriving a viewing story
from another configuration, explicitly clear inherited play functions and remove
regression tags. Review loaders, decorators, effects, and harness initialization
as well: initialize route/state fixtures directly instead of replaying a
workflow on mount. Manual event handlers should still work normally.

## State Examples and Playgrounds

Prefer supplying loading, pending, error, empty, selected, expanded, and open
states through existing component interfaces and story harness options. Do not
add production APIs solely for Storybook. Archive/delete confirmations and
account/group editors accept a typed pending `submitState` fixture from
`createPendingStorySubmitState`; it does not submit or start timers.

Simple/split transaction editors and rebooking have **Pending After Submit**
examples. They start idle, with valid drafts where supported. The user submits
manually; rebooking first requires selecting a destination. The split editor's
**Save Failed After Submit** example retains its draft and error after the user
chooses Save. Their automated counterparts verify those transitions separately.

Where interaction is needed, document the shortest manual setup in
`parameters.manualSetup`. The preview shows this as a note only for viewing
stories, outside the app UI. Stop at the intended state. Pair it with a Docs
story description when useful. `pendingStorySubmission` creates an isolated
unresolved promise after manual submission; remounting discards the pending UI.

Input playgrounds use `useArgs` so typing and Controls edit the same value. Keep
React input state in the shared `StoryValue` wrapper, separate from Storybook
hooks, so portable browser tests also rerender after selection. Callbacks remain
observable with `fn()`. Complex JSX and fixture objects should not be exposed as
editable Controls.

## Docs

Shared component metadata opts into `autodocs`, with purpose/usage descriptions
and useful prop Controls. Screen fixtures do not opt into Autodocs and have
Controls disabled. Keep one component concern per sidebar leaf and exclude
regression scenarios from generated Docs.

Docs autoplay is explicitly disabled globally. There are currently no autoplay
exceptions: use direct state fixtures or documented manual setup. Any future
exception must be narrowly scoped, explain why direct state/manual setup cannot
work, and must not make a default-visible story perform an automated workflow.
Keep dialogs, editors, and open drawers in isolated Docs iframes so their
portals cannot cover sibling examples.

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
coverage, and end-to-end runs to CI. Verify that original stories remain indexed
and implicitly test-eligible, that visible stories stay idle, and that
regression stories can be revealed through the tag filter. Compare original
assertion bodies and inspect manual playgrounds, pending/error setup, Docs,
Controls, toolbar changes, viewport dimensions, and modal portals in the
browser.

Reorganizing titles changes title-derived story IDs, external deep links, and
Chromatic story identity. Call out that migration in the PR. Do not use internal
ID overrides or change Chromatic approval policy to conceal it.

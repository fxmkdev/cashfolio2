# Dialogs and Forms

Scope: `apps/cashfolio-app2`; source paths are relative to that app.

[UI patterns](../ui-patterns.md) ·
[Architecture and ownership](../architecture.md)

## Modal Pattern

### Field Help

Keep essential instructions and validation messages visible beside or below the
input. Put longer optional explanations in a popover opened by an info icon
beside the field label, as used for Asset Class and Tracking Method. Give the
button a descriptive accessible name such as `Show Tracking Method Help` and a
matching tooltip. Support mouse and keyboard activation, keep the popover within
the viewport, and return focus to its trigger when closed. Escape dismisses the
popover without closing its containing dialog.

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

## Validation Pattern

Shared validators live in `src/shared/accounts/account-validation.ts` and are
used both client-side (in Mantine form `validate`) and server-side (in server
function handlers).

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
conflicts (see [server functions](../server-functions.md)). Optimistic edit
versions and live cross-tab synchronization remain separate follow-ups.

# UI Copy and Formatting

Scope: `apps/cashfolio-app2`; source paths are relative to that app.

[UI patterns](../ui-patterns.md) ·
[Architecture and ownership](../architecture.md)

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
[self-service deletion](../server/authentication-and-users.md#auth-and-authorization)
for the app-owned user deletion flow.

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

## Reference Currency Display Principle

Treat the account book reference currency as the standard case in UI display.
When a row already has a reference-currency amount column, do not repeat the
reference currency in adjacent unit columns or duplicate the same amount in the
booking-unit debit/credit columns. Show native unit labels and native
debit/credit amounts only when they add information, such as foreign currency,
crypto, or security bookings.

## FormattedNumberInput

`src/components/controls/formatted-number-input.tsx` wraps Mantine's
`NumberInput` using `Intl.NumberFormat` to extract locale-specific
thousand/decimal separators. An explicit `locale` prop takes precedence;
otherwise the input uses the active user locale from `useUserLocale()`. The
context fallback is `DEFAULT_USER_LOCALE` (`en-US`) from `src/user-locale.ts`.

Precision behavior:

- **Display contexts** enforce unit-aware precision via
  `src/shared/units/unit-format.ts`:
  - currencies: Unicode CLDR 48.2 standard display digits (with fallback to
    `2`), covering current and historical codes in `src/currencies.ts`; for
    example, COP and KRW use `0`, CHF uses `2`, KWD uses `3`, and CLF uses `4`
  - cryptocurrencies: Kraken `display_decimals` (with fallback to `8`)
  - securities: `0` decimals
- **Data-entry contexts** do not enforce decimal caps, so users can enter and
  review full decimal precision from the stored numeric value.

Currency display digits are pinned in
`src/shared/units/unit-format-currency-decimals.ts` so browser/runtime CLDR
versions do not change display precision. Cash digits and cash rounding
increments are not applied. Display formatting does not change stored amounts or
calculation precision.

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

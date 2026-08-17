# General Conference Tickets

## Goal
Replace the old Google Form + Form Responses sheet with a self-service web app for
Lansing Michigan Stake members to request General Conference tickets. Built to mirror the
Temple Day Signup app, which the user already runs and likes.

Requirements as given:
- Pick up to 5 tickets, no more.
- Tickets that are spoken for disappear from the form.
- Capture first name, last name, email, phone.
- Requester gets a confirmation email; the admin gets a notification so they can go
  secure the tickets.
- Per-session wait list capturing name, contact info and number of tickets wanted.
- A way for people to hand tickets back.
- Admin screen showing every ticket, its status, who holds it, and a way to put tickets
  back into circulation.
- A flexible grid tab: session name in row 1, start time in row 2, tickets below. Adding
  or renaming columns, changing times, or adding/removing tickets is picked up
  automatically.
- Optional auto-refresh so people see tickets disappear in near real time.

## Prior art
`../Temple Day Signup/` — same architecture. Features carried over: glassmorphic
light/dark design system, sheet-configurable refresh interval, toast notifications,
jump nav, support banner, self-service removal modal, Change Log tab, admin email
notifications, and the "paste your Apps Script URL" setup screen.

## Decisions made with the user (2026-08-16)
1. **Ticket cap is per person across all requests**, keyed on email address, not per
   submission. Configurable via `Max Tickets Per Person`.
2. **Give-back is self-service and instant** — the requester looks themselves up and the
   tickets go straight back into circulation. Admin is emailed.
3. **Admin screen is hidden-URL only** (`#admin`), no passcode required. An optional
   `Admin Passcode` setting exists and is blank by default; the admin screen displays a
   standing warning while unlocked.
4. **Hosting: GitHub Pages**, same as Temple Day. `vite.config.ts` uses `base: './'` so
   the build works at a repo subpath. Repo not yet created.

## Architecture
- **Frontend:** React 18 + TypeScript + Vite, custom CSS, `lucide-react` icons.
  Hash routing (`#admin`) — no router dependency.
- **Backend:** Google Apps Script web app (`doGet`/`doPost`) deployed from the
  spreadsheet. No Google Cloud project or service account, matching the user's
  established pattern.
- **Spreadsheet:** <https://docs.google.com/spreadsheets/d/1MV19k-rL85qFMtBdXN_ORXigRSdL-J-gDiWP-Ha1PuY/>
  The pre-existing `Form Responses 1` tab is left alone (user will hide it).

### Data model
Five tabs. `Tickets` is pure inventory; reservation state lives in a separate ledger so
the grid stays freely editable.

- `Tickets` — row 1 session name, row 2 start time, rows 3+ ticket labels
  (e.g. `Section TE9 - Row FF - Seat 2`). Blank row-1 column = ignored.
- `Reservations` — one row per ticket per request: Timestamp, Request ID, Session,
  Session Time, Ticket, First/Last Name, Email, Phone, Status, Notes, Last Updated.
- `Wait List` — Timestamp, Request ID, Session, name, contact, Tickets Wanted, Notes, Status.
- `General Info` — settings, read by **label in column A** rather than fixed cell
  addresses (Temple Day used hardcoded B2/B7/B8/B9, which was brittle).
- `Change Log` — audit trail.

A ticket is unavailable when a ledger row for that session+ticket has a status not in
`{Released, Declined, Cancelled}`. Unknown statuses hold the ticket — failing closed so a
typo can't double-book a seat.

### Session matching
Reservations are matched to grid columns by **session name** (normalized), falling back to
name+time only when two columns share a name. This means changing a session's time is
safe; renaming one orphans its reservations. The admin screen surfaces orphans with the
affected session names rather than silently freeing those seats.

### Concurrency
`reserve` and `release` take a `LockService` script lock and re-verify availability
*inside* the lock before writing. Each submission carries a client-generated token; a
replay of the same token is a no-op, so double-clicks and retries can't book twice.

### Privacy
The public `doGet` payload contains no names, emails or phone numbers — only which
tickets remain free. Contact details appear only in the admin payload
(`?admin=1`). Self-service lookup requires email **and** last name so an email address
alone can't be used to fish for someone's details.

## Verification done
Built against a throwaway mock backend implementing the same JSON contract:
- Reserve flow end-to-end, confirmation screen, live availability update.
- 5-ticket cap client-side (6th selection blocked, rest disabled) and server-side across
  separate requests ("You already have 5 reserved…").
- Self-service release — tickets returned to circulation immediately.
- Admin: ticket table, requests grouping, wait list, change log, per-row and bulk status
  changes, stats recalculation.
- Light/dark themes, mobile 375px (no horizontal overflow), WCAG AA contrast in light
  mode (amber/green/red text tokens were darkened; session time was 2.1:1, now 4.8:1).
- `npm run build` and `npm run lint` both clean.

### Live verification (2026-08-16, real deployment + real inventory)
Deployed URL, real 22-ticket inventory, real emails to the owner's personal
address (requester) and lansingstake@gmail.com (admin):
- Two requests (3 Saturday + 2 Sunday), wait list entry, self-service release of 2,
  admin forward, admin bulk release of 4, admin wait list cancel. All succeeded.
- **Duplicate seat labels across sessions confirmed working.** The real inventory reuses
  `Section TE9 - Row FF - Seat 2` etc. in both sessions; claiming it in one left the
  other untouched, and lookup/release kept them distinct.
- Per-person cap held across two separate requests in two different sessions.
- Sheet returned to 22/22 available, wait list cleared.

**Bug found and fixed during this test:** the Requests tab's group "Forwarded" button
applied to every row in the group including already-`Released` ones, silently pulling a
returned ticket back out of circulation. Group actions and the group checkbox now scope
to still-held rows only (`Release all` already did). Per-ticket "Re-hold" remains the
explicit way to restore a released ticket.

An earlier deployment attempt returned the Google sign-in page because "Who has access"
was not set to `Anyone` — worth checking first if the app ever shows a connection error.

## Wording changes (2026-08-16, after the live test)
- **"Released" renamed to "Returned"** throughout — status values, admin buttons, change
  log actions and email copy. The user found "Released" ambiguous: it reads as the stake
  *releasing tickets to* members rather than a member handing them back. `released` stays
  in `FREED_STATUSES` on both the backend and `AdminView`, so rows written before the
  rename keep their tickets free; the admin status filter matches both spellings.
- Two General Info labels renamed with an `alt` legacy fallback in `CONFIG_SCHEMA`
  (`Release Enabled` → `Returns Enabled`, `Notify Admin On Release` → `Notify Admin On
  Return`). `getConfig_` falls back to the old label and `setupSpreadsheet` won't add a
  duplicate row, so existing sheets need no edit.
- Confirmation emails now lead with the return call to action (`returnBlock_`) and demote
  the support contact beneath it. Added an **App URL** setting; when set, the email's
  "Return my tickets" button links to `<appUrl>#return`, which opens the give-back form
  directly. Blank App URL degrades to a text instruction.
- New `#return` route in `PublicView` opens the release modal on load and clears the hash
  on close so a reload doesn't reopen it.

## Deployment via clasp (set up 2026-08-16)
`AppsScript.js` no longer needs copy/pasting. `@google/clasp` v3 is a devDependency of
`source/`, authenticated as lansingstake@gmail.com from the user's pre-existing
`~/.clasprc.json` (scopes include `script.projects`, `script.deployments`,
`script.webapp.deploy`).

- Script ID `1YTQsBnIyaVZWZIOJYEu-Mlk55cYukgaA_6kcnHlyXMBgT7xB5YlD8dp-` in `.clasp.json`.
- `npm run gas:deploy` pushes and updates deployment
  `AKfycby1i5jWT41HZXHq54kZEPCF6tiKEcMCJT4uVWw6KmsoR5Q_BMng65VcWMuWZc526EkcTg`
  **in place**, so the `/exec` URL is stable. `gas:push` updates the editor only.
- `.claspignore` ignores everything then re-allows only `AppsScript.js` and
  `appsscript.json`. Verified via `clasp status --json` that `src/`, `node_modules/` and
  **`.env.local`** are excluded — without it clasp would upload the whole React project.
- `appsscript.json` is version-controlled, pinning
  `"webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }`. This is the
  setting that was wrong on first deploy and sent visitors to a Google sign-in page.
- The push replaces the whole remote file set: the original `Code.js` was removed and
  replaced by `AppsScript.js`. Confirmed by re-pulling — no duplicate globals.

Credentials live in `~/.clasprc.json` (outside the repo) and must never be committed.

## Seat picking + Ward/Branch (2026-08-16)
- Seat chips on each session card are now **selectable buttons**. Picking happens on the
  card; the modal ("Almost there") only confirms the queued seats and collects contact
  details. Selection state lives in `PublicView` keyed by session, capped at
  `maxTicketsPerPerson`, and is pruned when a refresh claims a seat out from under it.
- `.ticket-chips` is a CSS grid (`repeat(auto-fill, minmax(190px, 1fr))`), so every chip
  is exactly equal width and lines up in columns regardless of label length. Verified: 12
  chips all 197px across 3 aligned columns.
- New required **Ward / Branch** field: 9 stake units plus `Other` with a free-text
  fill-in. `resolveWard()` collapses the two inputs to the single value stored and emailed.

### Ledger tabs now map by header name
Adding the Ward column meant existing rows would shift if reads stayed positional, so
`readTable_`/writes were refactored to resolve columns from the **sheet's own header row**
(`headerMap_`, `rowFor_`, `colOnSheet_`). `ensureHeaders_` appends any missing expected
column on the right and is called before every write, so a sheet created by an older
version upgrades itself — no manual `setupSpreadsheet()` run needed. Verified live: the
Ward column was appended at position 13 and pre-existing rows kept their Status/Notes
alignment.

## Known gaps / possible follow-ups
- **Assigning a returned ticket to someone on the wait list** is manual: email them, then
  they request it themselves, or add a Reservations row by hand. An admin
  "reserve on behalf of" action would close this; it was deliberately left out as
  out of scope rather than shipped half-wired.
- Renaming a session after reservations exist requires editing the Reservations tab.
- Apps Script consumer Gmail accounts have a ~100 emails/day `MailApp` quota.

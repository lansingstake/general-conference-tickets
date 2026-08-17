# General Conference Tickets

Self-service ticket request app for the Lansing Michigan Stake, backed by a Google Sheet
through a Google Apps Script web app. Same pattern as the Temple Day Signup app.

- People tap the seats they want right on the session card (up to 5 per person), then
  give their name, email, phone and ward/branch.
- Claimed tickets disappear from the form immediately.
- Per-session wait list.
- Self-service "give tickets back" that returns seats to circulation right away.
- Admin screen at `#admin` showing every ticket, its status and who holds it.
- Everything about the ticket inventory is read live from one spreadsheet tab.

---

## 1. Set up the spreadsheet

1. Open the ticket spreadsheet, then **Extensions › Apps Script**.
2. Delete whatever is in `Code.gs` and paste in the whole of [`AppsScript.js`](AppsScript.js).
3. Save, then in the function dropdown pick **`setupSpreadsheet`** and press **Run**.
   Approve the permissions prompt the first time.
4. It creates five tabs (and skips any that already exist):

   | Tab | What it is |
   | --- | --- |
   | **Tickets** | The inventory grid. The only tab you normally edit. |
   | **Reservations** | Ledger — one row per ticket per request. Written by the app. |
   | **Wait List** | Wait list entries. Written by the app. |
   | **General Info** | Settings. Edit these freely. |
   | **Change Log** | Audit trail of every request, release and admin action. |

5. Fill in the **Tickets** tab, then hide your old Form Responses tab.

### The Tickets grid

```
        A                            B                        C
1   Saturday Afternoon Session   Sunday Morning Session   Sunday Afternoon Session   <- session name
2   2:00 pm                      10:00 am                 2:00 pm                    <- start time
3   Section TE9 - Row FF - Seat 2   Section TE8 - Row X - Seat 16   ...               <- tickets
4   Section TE9 - Row FF - Seat 3   Section TE8 - Row X - Seat 17
5   ...
```

- **Row 1** is the session name. A column with a blank row 1 is ignored entirely.
- **Row 2** is the start time, shown exactly as you type it.
- **Row 3 and below** is one ticket per row. Blank rows in the middle are skipped.
- Add a column, rename a session, change a time, add or delete tickets — the app
  re-reads the grid on every refresh. Nothing is hardcoded.

**One caution:** reservations are matched back to a column by *session name*. Changing a
session's **time** is always safe. **Renaming** a session after people have reserved
orphans those reservations — the admin screen warns you and names the affected sessions.
If you must rename, update the matching `Session` values in the Reservations tab too.

### General Info settings

Read by the label in column A, so you can reorder or insert rows safely.

| Setting | Default | Notes |
| --- | --- | --- |
| Event Name | General Conference Tickets | Big title |
| Event Subtitle | Lansing Michigan Stake | Line under the title |
| Event Dates | *(blank)* | e.g. `October 3-4, 2026` |
| Guidelines | 3 bullets | One bullet per line |
| Header Notice | *(blank)* | Highlighted banner; blank hides it |
| Support Email | LansingStake@gmail.com | Shown to people needing help |
| App URL | *(blank)* | Public address of this app. Makes the "Return my tickets" button in confirmation emails a real link |
| How To Video URL | *(blank)* | Blank hides the button |
| Refresh Interval Seconds | 30 | `0` turns auto-refresh off for everyone |
| Max Tickets Per Person | 5 | Total held per email address, across all sessions |
| Requests Open | TRUE | `FALSE` hides request buttons, shows Closed Message |
| Closed Message | … | Shown when Requests Open is FALSE |
| Wait List Enabled | TRUE | |
| Wait List Always Visible | TRUE | `FALSE` shows it only on full sessions |
| Returns Enabled | TRUE | Controls the "give tickets back" button |
| Send Confirmation To Requester | TRUE | |
| Notify Admin On Request / Return / Wait List | TRUE | |
| Admin Email | LansingStake@gmail.com | Commas for several addresses |
| Reply To Email | LansingStake@gmail.com | |
| Admin Passcode | *(blank)* | Blank = no passcode on the admin screen |

## 2. Deploy the web app

**Deploy › New deployment › Web app**

- Description: anything
- Execute as: **Me**
- Who has access: **Anyone**

Copy the `/exec` URL.

> Re-deploy every time you change `AppsScript.js`, or the change won't take effect.

### Deploying from the command line (no copy/paste)

`clasp` is wired up, so after the first browser login you never have to paste code again:

```bash
npm --prefix source run gas:deploy
```

That pushes `AppsScript.js` + `appsscript.json` and updates the existing deployment **in
place**, so the `/exec` URL never changes.

- `npm run gas:status` — show exactly which files would be pushed
- `npm run gas:push` — update the editor only, without making it live

Setup, one time per machine:

1. `npx clasp login` — opens a browser; credentials land in `~/.clasprc.json`
2. Turn on the Apps Script API at <https://script.google.com/home/usersettings>

`.clasp.json` holds the Script ID and `.claspignore` restricts the push to just those two
files — without it clasp would try to upload `src/`, `node_modules/` and `.env.local`.

`appsscript.json` is version-controlled, which pins the two settings that are easy to get
wrong by hand:

```json
"webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
```

`USER_DEPLOYING` is "Me" and `ANYONE_ANONYMOUS` is "Anyone" — anything else sends visitors
to a Google sign-in page instead of the app.

## 3. Run the web app

```bash
npm install
```

Put the URL in `.env.local` (copy `.env.example`):

```
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
```

```bash
npm run dev
```

Without the env var the app shows a one-time "Connect to your spreadsheet" screen and
remembers the URL in that browser only — fine for testing, not for real users.

## 4. Publishing

**Live at <https://lansingstake.github.io/general-conference-tickets/>**

Pushing to `main` rebuilds and redeploys automatically via
`.github/workflows/deploy.yml`. There is nothing to run by hand.

The Apps Script endpoint is baked in from `source/.env.production`, which is committed on
purpose — the URL is visible in the deployed page source either way, and the admin screen
is protected by the **Admin Passcode**, not by that URL being secret.

> Do **not** add a `VITE_APPS_SCRIPT_URL` env var to the workflow. An unset repo secret
> expands to an empty string, and an empty env var overrides `.env` files in Vite, which
> ships a build that asks every visitor to paste in the URL. The workflow now asserts the
> URL is present in the bundle and fails the build if it isn't.

---

### Ledger columns

`Reservations` and `Wait List` are read by **header name**, not column position, so you
can reorder columns or add your own. If a newer version of the script expects a column the
sheet doesn't have, it is appended on the right automatically the next time something is
written — existing rows stay put.

## Links into the app

| Link | Opens |
| --- | --- |
| <https://lansingstake.github.io/general-conference-tickets/> | The normal request page |
| …`/#return` | Straight to the give-back form — the confirmation email's button |
| …`/#admin` | The admin screen |

## Admin screen

Visit the site with `#admin` on the end.

- **Tickets** — every ticket in the grid, its status, and who holds it. Filter by session
  or status, search any field, export CSV.
- **Requests** — grouped by submission, so a family's tickets appear on one row.
- **Wait list** — contact details, how many tickets they want, mark Fulfilled or
  Cancelled, one-click email, copy all addresses.
- **Change log** — everything that has happened.

Select rows for bulk **Mark forwarded** / **Return** / **Decline**. Group actions in the
Requests tab only ever touch tickets the person still holds — they will not pull a
returned ticket back out of circulation. Use the per-ticket **Re-hold** button for that.

### Statuses

| Status | Holds the ticket? | Meaning |
| --- | --- | --- |
| Requested | yes | Submitted, you haven't secured it yet |
| Forwarded | yes | You've sent them the ticket |
| Returned | no | Handed back; available again |
| Declined | no | Turned down; available again |

Any status you invent yourself keeps the ticket held, so a typo can never double-book a
seat. Only `Returned`, `Declined` and `Cancelled` free one up. `Released` is the old
spelling of `Returned` and is still recognised, so rows written before the rename keep
working.

### A note on admin security

With **Admin Passcode** blank, anyone who finds the `#admin` link can read names, emails
and phone numbers and change reservations. The screen warns you while it's unlocked. Put
any value in that cell to require a passcode — no rebuild needed.

---

## How it fits together

```
Tickets tab (inventory)  ─┐
Reservations (ledger)    ─┼─► Apps Script doGet ─► JSON ─► React app
Wait List / General Info ─┘                    ◄─ doPost (reserve/waitlist/lookup/release/admin)
```

Reservations live in their own ledger rather than in the grid, which is what keeps the
Tickets tab a clean list you can edit freely. A ticket is "taken" when a ledger row for
that session + ticket has a status that still holds it.

The public JSON deliberately contains **no** names, emails or phone numbers — only which
tickets are still free. Contact details are only in the admin payload.

Reserving and releasing run inside a `LockService` script lock and re-check availability
inside the lock, so two people clicking the same seat at the same moment can't both get
it. Each submission carries a token so a double-click or a retry can't book twice.

## Project layout

```
AppsScript.js        Google Apps Script backend (paste into the sheet)
src/
  App.tsx            Shell: routing, polling, theme, toasts, setup screen
  api.ts             fetch/post helpers and error shaping
  contact.ts         Contact validation, phone formatting, remembered details
  types.ts           Shared types, mirrors the JSON contract
  index.css          Design system, light + dark
  components/
    PublicView.tsx   Session cards, guidelines, action buttons
    ReserveModal.tsx Seat picker with the per-person cap
    WaitListModal.tsx
    ReleaseModal.tsx Look up by email + last name, hand tickets back
    ContactFields.tsx
    AdminView.tsx    Admin tables and bulk actions
```

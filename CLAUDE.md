# General Conference Tickets

React + TypeScript + Vite web app for Lansing Michigan Stake General Conference ticket
requests, backed by a Google Sheet via a Google Apps Script web app.

**Read `CONTEXT.md` before starting work** — it covers the architecture, data model, the
decisions made with the user, and known gaps.

- `source/` — the React app (`src/`) and the Apps Script backend (`AppsScript.js`)
- `source/README.md` — setup, deployment and the spreadsheet layout
- Sibling project `../Temple Day Signup/` is the design and architecture reference

## Working notes
- The `Tickets` tab is the source of truth for inventory and must stay freely editable —
  never write reservation state into it. That state belongs in the `Reservations` ledger.
- `General Info` settings are read by label in column A, not by cell address. Add new
  settings to `CONFIG_SCHEMA` in `AppsScript.js` and they appear on the next
  `setupSpreadsheet()` run.
- Any change to `AppsScript.js` needs **Deploy › New deployment** to take effect.
- The public JSON payload must never carry names, emails or phone numbers.

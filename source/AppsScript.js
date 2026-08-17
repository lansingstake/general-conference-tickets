/*******************************************************************************
 * GENERAL CONFERENCE TICKETS — Google Apps Script backend
 *
 * Paste this into Extensions > Apps Script on the ticket spreadsheet, then:
 *   1. Run  setupSpreadsheet()  once (creates/repairs all tabs).
 *   2. Deploy > New deployment > Web app
 *        - Execute as:      Me
 *        - Who has access:  Anyone
 *   3. Copy the /exec URL into the web app (or into .env.local as
 *      VITE_APPS_SCRIPT_URL).
 *
 * SHEET LAYOUT — the "Tickets" tab is the only thing you normally edit:
 *   Row 1  = Session Name        e.g. "Sunday Morning Session"
 *   Row 2  = Start Time          e.g. "10:00 am"
 *   Row 3+ = one ticket per row  e.g. "Section TE9 - Row FF - Seat 2"
 *
 * Add a column, rename a session, change a time, add or delete tickets —
 * the app re-reads the grid on every request. Nothing here is hardcoded.
 *
 * Reservations live in their own ledger tab, so the Tickets grid stays a
 * clean inventory list you can edit freely.
 ******************************************************************************/

var TICKETS_SHEET  = 'Tickets';
var RESV_SHEET     = 'Reservations';
var WAIT_SHEET     = 'Wait List';
var CONFIG_SHEET   = 'General Info';
var LOG_SHEET      = 'Change Log';

var SESSION_ROW      = 1;  // row holding session names
var TIME_ROW         = 2;  // row holding start times
var FIRST_TICKET_ROW = 3;  // first row of actual tickets

/* A reservation in any of these statuses has let go of its ticket. Anything
 * else — including a status you invent yourself — keeps the ticket held, so
 * an unfamiliar value never silently double-books a seat.
 * 'released' is the old name for 'returned' and stays recognised so rows written
 * before the rename keep their tickets free. */
var FREED_STATUSES = ['returned', 'released', 'declined', 'cancelled', 'canceled'];

var RESV_HEADERS = ['Timestamp', 'Request ID', 'Session', 'Session Time', 'Ticket',
                    'First Name', 'Last Name', 'Email', 'Phone', 'Ward / Branch',
                    'Status', 'Notes', 'Last Updated'];

var WAIT_HEADERS = ['Timestamp', 'Request ID', 'Session', 'First Name', 'Last Name',
                    'Email', 'Phone', 'Ward / Branch', 'Tickets Wanted', 'Notes',
                    'Status', 'Last Updated'];

var LOG_HEADERS  = ['Timestamp', 'Action', 'Name', 'Email', 'Session', 'Tickets', 'Details'];

/* Config is read by LABEL in column A, not by cell address, so inserting or
 * reordering rows in General Info never breaks anything. */
var CONFIG_SCHEMA = [
  { label: 'Event Name',                 key: 'eventName',             type: 'text', def: 'General Conference Tickets' },
  { label: 'Event Subtitle',             key: 'eventSubtitle',         type: 'text', def: 'Lansing Michigan Stake' },
  { label: 'Event Dates',                key: 'eventDates',            type: 'text', def: '' },
  { label: 'Guidelines',                 key: 'guidelines',            type: 'text', def: 'Tickets are for members of the Lansing Stake only\nLimit 5 tickets per family (add yourself to the Wait List for more than 5)\nTickets are free' },
  { label: 'Header Notice',              key: 'headerNotice',          type: 'text', def: '' },
  { label: 'Support Email',              key: 'supportEmail',          type: 'text', def: 'LansingStake@gmail.com' },
  { label: 'App URL',                    key: 'appUrl',                type: 'text', def: '' },
  { label: 'How To Video URL',           key: 'howToVideoUrl',         type: 'text', def: '' },
  { label: 'Refresh Interval Seconds',   key: 'refreshIntervalSeconds',type: 'int',  def: 30 },
  { label: 'Max Tickets Per Person',     key: 'maxTicketsPerPerson',   type: 'int',  def: 5 },
  { label: 'Requests Open',              key: 'requestsOpen',          type: 'bool', def: true },
  { label: 'Closed Message',             key: 'closedMessage',         type: 'text', def: 'Ticket requests are closed right now. Please check back later.' },
  { label: 'Wait List Enabled',          key: 'waitListEnabled',       type: 'bool', def: true },
  { label: 'Wait List Always Visible',   key: 'waitListAlwaysVisible', type: 'bool', def: true },
  { label: 'Returns Enabled',            key: 'releaseEnabled',        type: 'bool', def: true, alt: 'Release Enabled' },
  { label: 'Send Confirmation To Requester', key: 'sendConfirmation',  type: 'bool', def: true },
  { label: 'Notify Admin On Request',    key: 'notifyAdminOnRequest',  type: 'bool', def: true },
  { label: 'Notify Admin On Return',     key: 'notifyAdminOnRelease',  type: 'bool', def: true, alt: 'Notify Admin On Release' },
  { label: 'Notify Admin On Wait List',  key: 'notifyAdminOnWaitList', type: 'bool', def: true },
  { label: 'Admin Email',                key: 'adminEmail',            type: 'text', def: 'LansingStake@gmail.com', private: true },
  { label: 'Reply To Email',             key: 'replyToEmail',          type: 'text', def: 'LansingStake@gmail.com', private: true },
  { label: 'Admin Passcode',             key: 'adminPasscode',         type: 'text', def: '', private: true }
];

/* ============================================================ MENU + SETUP */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Conference Tickets')
    .addItem('Set up / repair sheets', 'setupSpreadsheet')
    .addItem('Authorize email sending', 'forceAuth')
    .addToUi();
}

/**
 * Creates any missing tab and fills in missing config rows. Safe to re-run —
 * it never overwrites data you already have.
 */
function setupSpreadsheet() {
  var wb = SpreadsheetApp.getActiveSpreadsheet();
  var created = [];

  // --- Tickets grid -------------------------------------------------------
  var tickets = wb.getSheetByName(TICKETS_SHEET);
  if (!tickets) {
    tickets = wb.insertSheet(TICKETS_SHEET, 0);
    tickets.getRange(1, 1, 1, 2).setValues([['Saturday Afternoon Session', 'Sunday Morning Session']]);
    tickets.getRange(2, 1, 1, 2).setValues([['2:00 pm', '10:00 am']]);
    tickets.getRange(3, 1, 3, 1).setValues([
      ['Section TE9 - Row FF - Seat 2'],
      ['Section TE9 - Row FF - Seat 3'],
      ['Section TE9 - Row FF - Seat 4']
    ]);
    tickets.getRange(3, 2, 3, 1).setValues([
      ['Section TE9 - Row AA - Seat 8'],
      ['Section TE9 - Row AA - Seat 9'],
      ['Section TE9 - Row AA - Seat 10']
    ]);
    tickets.getRange(1, 1, 1, tickets.getMaxColumns()).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
    tickets.getRange(2, 1, 1, tickets.getMaxColumns()).setFontStyle('italic').setBackground('#374151').setFontColor('#e5e7eb');
    tickets.setFrozenRows(2);
    tickets.setColumnWidths(1, 2, 240);
    created.push(TICKETS_SHEET);
  }

  created = created.concat([
    ensureSheet_(wb, RESV_SHEET, RESV_HEADERS),
    ensureSheet_(wb, WAIT_SHEET, WAIT_HEADERS),
    ensureSheet_(wb, LOG_SHEET, LOG_HEADERS)
  ].filter(String));

  // --- General Info -------------------------------------------------------
  var cfgSheet = wb.getSheetByName(CONFIG_SHEET);
  if (!cfgSheet) {
    cfgSheet = wb.insertSheet(CONFIG_SHEET);
    cfgSheet.getRange(1, 1, 1, 3).setValues([['Setting', 'Value', 'What it does']]);
    cfgSheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
    cfgSheet.setFrozenRows(1);
    created.push(CONFIG_SHEET);
  }

  var existing = {};
  var lastRow = cfgSheet.getLastRow();
  if (lastRow > 1) {
    cfgSheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues().forEach(function (r) {
      existing[norm_(r[0])] = true;
    });
  }
  CONFIG_SCHEMA.forEach(function (item) {
    // A row under the setting's former name still counts — don't add a duplicate.
    if (existing[norm_(item.label)]) return;
    if (item.alt && existing[norm_(item.alt)]) return;
    cfgSheet.appendRow([item.label, item.def, CONFIG_HELP[item.key] || '']);
  });
  cfgSheet.setColumnWidth(1, 230);
  cfgSheet.setColumnWidth(2, 320);
  cfgSheet.setColumnWidth(3, 460);

  SpreadsheetApp.getUi().alert(
    created.length
      ? 'Set up complete.\n\nCreated: ' + created.join(', ') + '\n\nMissing General Info settings were added.'
      : 'Everything was already in place. Any missing General Info settings have been added.'
  );
}

var CONFIG_HELP = {
  eventName: 'Big title at the top of the app.',
  eventSubtitle: 'Smaller line under the title.',
  eventDates: 'Shown under the title, e.g. "October 3-4, 2026".',
  guidelines: 'Bullet list at the top of the app. One bullet per line.',
  headerNotice: 'Optional highlighted banner. Leave blank to hide it.',
  supportEmail: 'Shown to people who need help. Also the "give tickets back" contact.',
  appUrl: 'Public web address of this app. Turns the "Return my tickets" button in confirmation emails into a working link. Leave blank and the email just describes where to go.',
  howToVideoUrl: 'Optional link to a how-to video. Leave blank to hide the button.',
  refreshIntervalSeconds: 'How often the page re-checks for taken tickets. 0 turns auto-refresh off.',
  maxTicketsPerPerson: 'Most tickets one email address may hold at once, across every session.',
  requestsOpen: 'FALSE hides all request buttons and shows the Closed Message instead.',
  closedMessage: 'Shown when Requests Open is FALSE.',
  waitListEnabled: 'FALSE hides the wait list entirely.',
  waitListAlwaysVisible: 'TRUE shows the wait list button even when tickets remain.',
  releaseEnabled: 'FALSE hides the "give tickets back" button.',
  notifyAdminOnRelease: 'Email Admin Email whenever someone returns tickets.',
  sendConfirmation: 'Email the requester a copy of their selection.',
  notifyAdminOnRequest: 'Email Admin Email whenever someone requests tickets.',
  notifyAdminOnWaitList: 'Email Admin Email whenever someone joins the wait list.',
  adminEmail: 'Where your notifications go. Separate several addresses with commas.',
  replyToEmail: 'Reply-to address on emails sent to requesters.',
  adminPasscode: 'Leave blank for no passcode. Fill it in to require a code on the admin screen.'
};

function ensureSheet_(wb, name, headers) {
  var sheet = wb.getSheetByName(name);
  if (sheet) {
    // Repair a missing header row without touching existing data.
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    } else {
      ensureHeaders_(sheet, headers);
    }
    return '';
  }
  sheet = wb.insertSheet(name);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
  return name;
}

/** Run once from the editor if Google never prompts for email permission. */
function forceAuth() {
  MailApp.getRemainingDailyQuota();
  SpreadsheetApp.getUi().alert('Email sending is authorized.');
}

/* ================================================================= ROUTES */

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    var cfg = getConfig_();

    if (params.admin === '1') {
      var check = checkAdmin_(cfg, params.passcode);
      if (!check.ok) return json_({ status: 'error', code: 'auth', message: check.message });
      return json_(buildAdminPayload_(cfg));
    }

    return json_(buildPublicPayload_(cfg));
  } catch (err) {
    return json_({ status: 'error', message: String(err) });
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var cfg = getConfig_();
    var action = data.action || '';

    switch (action) {
      case 'reserve':  return json_(handleReserve_(data, cfg));
      case 'waitlist': return json_(handleWaitlist_(data, cfg));
      case 'lookup':   return json_(handleLookup_(data, cfg));
      case 'release':  return json_(handleRelease_(data, cfg));
      case 'admin':    return json_(handleAdmin_(data, cfg));
      default:         return json_({ status: 'error', message: 'Unknown action: ' + action });
    }
  } catch (err) {
    return json_({ status: 'error', message: String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkAdmin_(cfg, supplied) {
  var required = String(cfg._private.adminPasscode || '').trim();
  if (!required) return { ok: true };
  if (String(supplied || '').trim() === required) return { ok: true };
  return { ok: false, message: 'Incorrect passcode.' };
}

/* ================================================================ READING */

function getConfig_() {
  var wb = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = wb.getSheetByName(CONFIG_SHEET);
  var raw = {};

  if (sheet && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues().forEach(function (row) {
      var label = norm_(row[0]);
      if (label) raw[label] = row[1];
    });
  }

  var pub = {}, priv = {};
  CONFIG_SCHEMA.forEach(function (item) {
    var val = raw[norm_(item.label)];
    if ((val === undefined || String(val).trim() === '') && item.alt) val = raw[norm_(item.alt)];
    var parsed;
    if (val === undefined || String(val).trim() === '') {
      parsed = item.def;
    } else if (item.type === 'bool') {
      parsed = toBool_(val);
    } else if (item.type === 'int') {
      var n = parseInt(String(val).replace(/[^0-9-]/g, ''), 10);
      parsed = isNaN(n) || n < 0 ? item.def : n;
    } else {
      parsed = String(val).trim();
    }
    if (item.private) priv[item.key] = parsed;
    else pub[item.key] = parsed;
  });

  pub.sheetUrl = wb.getUrl();
  return { pub: pub, _private: priv };
}

/**
 * Reads the Tickets grid. Every column with a non-empty row 1 becomes a
 * session; every non-empty cell from row 3 down becomes a ticket.
 */
function parseSessions_() {
  var wb = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = wb.getSheetByName(TICKETS_SHEET);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < FIRST_TICKET_ROW || lastCol < 1) return [];

  // getDisplayValues keeps "10:00 am" as typed instead of a Date object.
  var grid = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  var sessions = [];
  var nameCounts = {};

  for (var c = 0; c < lastCol; c++) {
    var name = String(grid[SESSION_ROW - 1][c] || '').trim();
    if (!name) continue;                      // blank header = column ignored
    var time = String(grid[TIME_ROW - 1][c] || '').trim();

    var seen = {};
    var tickets = [];
    var duplicates = [];
    for (var r = FIRST_TICKET_ROW - 1; r < lastRow; r++) {
      var label = String(grid[r][c] || '').trim();
      if (!label) continue;                   // blank rows are skipped, not fatal
      var k = norm_(label);
      if (seen[k]) { duplicates.push(label); continue; }
      seen[k] = true;
      tickets.push({ label: label, row: r + 1 });
    }

    nameCounts[norm_(name)] = (nameCounts[norm_(name)] || 0) + 1;
    sessions.push({
      name: name,
      time: time,
      colIndex: c + 1,
      tickets: tickets,
      duplicates: duplicates
    });
  }

  // Only disambiguate by time when two columns really do share a name.
  sessions.forEach(function (s) {
    s.ambiguous = nameCounts[norm_(s.name)] > 1;
    s.key = s.ambiguous ? norm_(s.name) + '||' + norm_(s.time) : norm_(s.name);
  });

  return sessions;
}

function sessionKeyFor_(sessions, sessionName, sessionTime) {
  var n = norm_(sessionName);
  var byName = sessions.filter(function (s) { return norm_(s.name) === n; });
  if (byName.length === 1) return byName[0].key;
  if (byName.length > 1) {
    var exact = byName.filter(function (s) { return norm_(s.time) === norm_(sessionTime); });
    if (exact.length) return exact[0].key;
    return byName[0].key;
  }
  return null;  // session was renamed or deleted — reservation is orphaned
}

/**
 * Column positions come from the sheet's own header row, never from a fixed
 * array, so inserting, reordering or adding columns can't shift the data.
 */
function headerMap_(sheet) {
  var lastCol = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var map = {};
  headers.forEach(function (h, i) {
    var k = norm_(h);
    if (k && !map[k]) map[k] = i + 1;
  });
  return { headers: headers, map: map, lastCol: lastCol };
}

/**
 * Adds any expected column the sheet doesn't have yet, on the right so existing
 * rows stay aligned. Called before every write, so a sheet created by an older
 * version of the script upgrades itself instead of silently dropping values.
 */
function ensureHeaders_(sheet, expected) {
  var hm = headerMap_(sheet);
  var missing = expected.filter(function (h) { return !hm.map[norm_(h)]; });
  if (!missing.length) return hm;
  sheet.getRange(1, hm.lastCol + 1, 1, missing.length).setValues([missing])
    .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  SpreadsheetApp.flush();
  return headerMap_(sheet);
}

/** Builds a row array laid out to match the sheet, from a {header: value} object. */
function rowFor_(hm, obj) {
  var row = [];
  for (var i = 0; i < hm.lastCol; i++) row.push('');
  Object.keys(obj).forEach(function (key) {
    var col = hm.map[norm_(key)];
    if (col) row[col - 1] = obj[key];
  });
  return row;
}

function readTable_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var hm = headerMap_(sheet);
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, hm.lastCol).getDisplayValues();
  var out = [];
  values.forEach(function (row, i) {
    var blank = row.every(function (v) { return String(v).trim() === ''; });
    if (blank) return;
    var obj = { _row: i + 2 };
    hm.headers.forEach(function (h, idx) {
      if (!String(h).trim()) return;
      obj[String(h).trim()] = String(row[idx] === undefined ? '' : row[idx]).trim();
    });
    out.push(obj);
  });
  return out;
}

/** 1-based column number of a header on a live sheet, or 0 if absent. */
function colOnSheet_(sheet, header) {
  return headerMap_(sheet).map[norm_(header)] || 0;
}

function readReservations_() { return readTable_(RESV_SHEET); }
function readWaitList_()     { return readTable_(WAIT_SHEET); }

function isHeld_(status) {
  return FREED_STATUSES.indexOf(norm_(status || 'Requested')) === -1;
}

function ticketKey_(sessionKey, ticketLabel) {
  return sessionKey + '>>' + norm_(ticketLabel);
}

/** Map of ticketKey -> reservation, for every reservation still holding a seat. */
function heldTickets_(sessions, reservations) {
  var held = {};
  reservations.forEach(function (res) {
    if (!isHeld_(res['Status'])) return;
    var key = sessionKeyFor_(sessions, res['Session'], res['Session Time']);
    if (!key) return;
    held[ticketKey_(key, res['Ticket'])] = res;
  });
  return held;
}

/* ================================================================ PAYLOADS */

/** What the public page sees. Deliberately carries no names, emails or phones. */
function buildPublicPayload_(cfg) {
  var sessions = parseSessions_();
  var reservations = readReservations_();
  var waitList = readWaitList_();
  var held = heldTickets_(sessions, reservations);

  var waitCounts = {};
  waitList.forEach(function (w) {
    if (norm_(w['Status'] || 'Waiting') !== 'waiting') return;
    var k = norm_(w['Session']);
    waitCounts[k] = (waitCounts[k] || 0) + 1;
  });

  return {
    status: 'ok',
    config: cfg.pub,
    sessions: sessions.map(function (s) {
      var open = s.tickets.filter(function (t) { return !held[ticketKey_(s.key, t.label)]; });
      return {
        key: s.key,
        name: s.name,
        time: s.time,
        total: s.tickets.length,
        available: open.length,
        // Only tickets that are still up for grabs cross the wire.
        tickets: open.map(function (t) { return t.label; }),
        waitListCount: waitCounts[norm_(s.name)] || 0
      };
    }),
    anySessionWaitCount: waitCounts[norm_('Any Session')] || 0,
    serverTime: new Date().toISOString()
  };
}

/** Everything, for the admin screen. */
function buildAdminPayload_(cfg) {
  var sessions = parseSessions_();
  var reservations = readReservations_();
  var waitList = readWaitList_();
  var held = heldTickets_(sessions, reservations);

  // Reservations that still hold a ticket but whose session is no longer in the
  // grid — a renamed or deleted column. Returned ones are ignored: they are not
  // holding anything, so there is nothing to act on.
  var orphans = [];
  reservations.forEach(function (res) {
    if (!isHeld_(res['Status'])) return;
    if (!sessionKeyFor_(sessions, res['Session'], res['Session Time'])) orphans.push(rowOut_(res));
  });

  return {
    status: 'ok',
    config: cfg.pub,
    passcodeRequired: !!String(cfg._private.adminPasscode || '').trim(),
    adminEmail: cfg._private.adminEmail,
    sessions: sessions.map(function (s) {
      return {
        key: s.key,
        name: s.name,
        time: s.time,
        duplicates: s.duplicates,
        tickets: s.tickets.map(function (t) {
          var res = held[ticketKey_(s.key, t.label)];
          return {
            label: t.label,
            row: t.row,
            status: res ? (res['Status'] || 'Requested') : 'Available',
            reservation: res ? rowOut_(res) : null
          };
        })
      };
    }),
    reservations: reservations.map(rowOut_),
    waitList: waitList.map(function (w) {
      return {
        row: w._row,
        timestamp: w['Timestamp'],
        requestId: w['Request ID'],
        session: w['Session'],
        firstName: w['First Name'],
        lastName: w['Last Name'],
        email: w['Email'],
        phone: w['Phone'],
        ward: w['Ward / Branch'] || '',
        ticketsWanted: w['Tickets Wanted'],
        notes: w['Notes'],
        status: w['Status'] || 'Waiting'
      };
    }),
    orphanReservations: orphans,
    changeLog: readTable_(LOG_SHEET).slice(-200).reverse().map(function (l) {
      return {
        row: l._row, timestamp: l['Timestamp'], action: l['Action'], name: l['Name'],
        email: l['Email'], session: l['Session'], tickets: l['Tickets'], details: l['Details']
      };
    }),
    serverTime: new Date().toISOString()
  };
}

function rowOut_(res) {
  return {
    row: res._row,
    timestamp: res['Timestamp'],
    requestId: res['Request ID'],
    session: res['Session'],
    sessionTime: res['Session Time'],
    ticket: res['Ticket'],
    firstName: res['First Name'],
    lastName: res['Last Name'],
    email: res['Email'],
    phone: res['Phone'],
    ward: res['Ward / Branch'] || '',
    status: res['Status'] || 'Requested',
    notes: res['Notes'],
    lastUpdated: res['Last Updated']
  };
}

/* ================================================================ ACTIONS */

function handleReserve_(data, cfg) {
  if (!cfg.pub.requestsOpen) {
    return { status: 'error', message: cfg.pub.closedMessage };
  }

  var first = String(data.firstName || '').trim();
  var last  = String(data.lastName || '').trim();
  var email = String(data.email || '').trim();
  var phone = String(data.phone || '').trim();
  var ward  = String(data.ward || '').trim();
  var notes = String(data.notes || '').trim();
  var wanted = (data.tickets || []).map(function (t) { return String(t).trim(); }).filter(String);

  var invalid = validateContact_(first, last, email, phone, ward);
  if (invalid) return { status: 'error', message: invalid };
  if (!wanted.length) return { status: 'error', message: 'Please choose at least one ticket.' };

  var max = cfg.pub.maxTicketsPerPerson;
  if (wanted.length > max) {
    return { status: 'error', message: 'You may request at most ' + max + ' tickets.' };
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (e) {
    return { status: 'error', message: 'The system is busy. Please try again in a moment.' };
  }

  try {
    var sessions = parseSessions_();
    var reservations = readReservations_();

    // Replaying the same submission (double-click, flaky network) is a no-op.
    if (data.clientToken) {
      var dup = reservations.filter(function (r) { return r['Request ID'] === data.clientToken; });
      if (dup.length) {
        return { status: 'ok', message: 'This request was already received.', requestId: data.clientToken, duplicate: true };
      }
    }

    var sessionKey = sessionKeyFor_(sessions, data.session, data.sessionTime);
    var session = sessions.filter(function (s) { return s.key === sessionKey; })[0];
    if (!session) {
      return { status: 'error', message: 'That session is no longer available. Please refresh the page.' };
    }

    // Ticket count is capped per PERSON across every session, not per request.
    var alreadyHeld = 0;
    reservations.forEach(function (r) {
      if (!isHeld_(r['Status'])) return;
      if (norm_(r['Email']) === norm_(email)) alreadyHeld++;
    });
    if (alreadyHeld + wanted.length > max) {
      var left = Math.max(0, max - alreadyHeld);
      return {
        status: 'error',
        code: 'limit',
        message: alreadyHeld === 0
          ? 'You may request at most ' + max + ' tickets.'
          : 'You already have ' + alreadyHeld + ' ticket' + (alreadyHeld === 1 ? '' : 's') +
            ' reserved, so you can request ' + left + ' more. Add yourself to the wait list if you need extras.'
      };
    }

    // Re-check availability inside the lock — this is the real gate.
    var held = heldTickets_(sessions, reservations);
    var valid = {};
    session.tickets.forEach(function (t) { valid[norm_(t.label)] = t.label; });

    var taken = [], unknown = [];
    wanted.forEach(function (label) {
      var canonical = valid[norm_(label)];
      if (!canonical) { unknown.push(label); return; }
      if (held[ticketKey_(session.key, canonical)]) taken.push(canonical);
    });

    if (unknown.length) {
      return { status: 'error', code: 'stale', message: 'These tickets are no longer listed: ' + unknown.join(', ') + '. Please refresh and try again.' };
    }
    if (taken.length) {
      return { status: 'error', code: 'taken', message: 'Someone just claimed ' + taken.join(', ') + '. Please refresh and pick different tickets.' };
    }

    var requestId = data.clientToken || Utilities.getUuid();
    var stamp = now_();
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RESV_SHEET);
    var hm = ensureHeaders_(sheet, RESV_HEADERS);
    var rows = wanted.map(function (label) {
      return rowFor_(hm, {
        'Timestamp': stamp, 'Request ID': requestId,
        'Session': session.name, 'Session Time': session.time,
        'Ticket': valid[norm_(label)],
        'First Name': first, 'Last Name': last, 'Email': email, 'Phone': phone,
        'Ward / Branch': ward, 'Status': 'Requested', 'Notes': notes, 'Last Updated': stamp
      });
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, hm.lastCol).setValues(rows);
    SpreadsheetApp.flush();

    var ticketList = wanted.map(function (l) { return valid[norm_(l)]; });
    log_('Requested', first + ' ' + last, email, session.name + ' - ' + session.time, ticketList.join('; '),
         wanted.length + ' ticket(s). ' + ward + '. Phone ' + phone + (notes ? '. Note: ' + notes : ''));

    var mail = notifyReserve_(cfg, {
      first: first, last: last, email: email, phone: phone, ward: ward, notes: notes,
      session: session.name, time: session.time, tickets: ticketList, requestId: requestId
    });

    return {
      status: 'ok',
      requestId: requestId,
      tickets: ticketList,
      session: session.name,
      sessionTime: session.time,
      emailed: mail.requester,
      message: 'Your request is in. ' + (mail.requester ? 'A confirmation is on its way to ' + email + '.' : '')
    };
  } finally {
    lock.releaseLock();
  }
}

function handleWaitlist_(data, cfg) {
  if (!cfg.pub.waitListEnabled) return { status: 'error', message: 'The wait list is closed.' };

  var first = String(data.firstName || '').trim();
  var last  = String(data.lastName || '').trim();
  var email = String(data.email || '').trim();
  var phone = String(data.phone || '').trim();
  var ward  = String(data.ward || '').trim();
  var notes = String(data.notes || '').trim();
  var session = String(data.session || 'Any Session').trim();
  var count = parseInt(data.ticketsWanted, 10);

  var invalid = validateContact_(first, last, email, phone, ward);
  if (invalid) return { status: 'error', message: invalid };
  if (isNaN(count) || count < 1) return { status: 'error', message: 'Please enter how many tickets you need.' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {
    return { status: 'error', message: 'The system is busy. Please try again in a moment.' };
  }

  try {
    var existing = readWaitList_();
    if (data.clientToken) {
      var dup = existing.filter(function (r) { return r['Request ID'] === data.clientToken; });
      if (dup.length) return { status: 'ok', message: 'You are already on the wait list.', duplicate: true };
    }

    var requestId = data.clientToken || Utilities.getUuid();
    var stamp = now_();
    var waitSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WAIT_SHEET);
    var waitHm = ensureHeaders_(waitSheet, WAIT_HEADERS);
    waitSheet.appendRow(rowFor_(waitHm, {
      'Timestamp': stamp, 'Request ID': requestId, 'Session': session,
      'First Name': first, 'Last Name': last, 'Email': email, 'Phone': phone,
      'Ward / Branch': ward, 'Tickets Wanted': count, 'Notes': notes,
      'Status': 'Waiting', 'Last Updated': stamp
    }));
    SpreadsheetApp.flush();

    log_('Wait List', first + ' ' + last, email, session, '',
         'Wants ' + count + ' ticket(s). ' + ward + '. Phone ' + phone + (notes ? '. Note: ' + notes : ''));

    var mail = notifyWaitlist_(cfg, {
      first: first, last: last, email: email, phone: phone, ward: ward, notes: notes,
      session: session, count: count
    });

    return {
      status: 'ok',
      requestId: requestId,
      emailed: mail.requester,
      message: "You're on the wait list for " + session + '.'
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Self-service lookup for the "give tickets back" flow. Requires email AND
 * last name so an email address alone can't be used to fish for someone's
 * details.
 */
function handleLookup_(data, cfg) {
  var email = String(data.email || '').trim();
  var last  = String(data.lastName || '').trim();
  if (!email || !last) return { status: 'error', message: 'Enter both your email address and last name.' };

  var sessions = parseSessions_();
  var mine = readReservations_().filter(function (r) {
    return isHeld_(r['Status']) &&
           norm_(r['Email']) === norm_(email) &&
           norm_(r['Last Name']) === norm_(last);
  });

  var waiting = readWaitList_().filter(function (w) {
    return norm_(w['Status'] || 'waiting') === 'waiting' &&
           norm_(w['Email']) === norm_(email) &&
           norm_(w['Last Name']) === norm_(last);
  });

  return {
    status: 'ok',
    reservations: mine.map(function (r) {
      var key = sessionKeyFor_(sessions, r['Session'], r['Session Time']);
      return {
        row: r._row,
        requestId: r['Request ID'],
        session: r['Session'],
        sessionTime: r['Session Time'],
        ticket: r['Ticket'],
        status: r['Status'] || 'Requested',
        timestamp: r['Timestamp'],
        sessionKey: key
      };
    }),
    waitList: waiting.map(function (w) {
      return { row: w._row, session: w['Session'], ticketsWanted: w['Tickets Wanted'], requestId: w['Request ID'] };
    })
  };
}

function handleRelease_(data, cfg) {
  if (!cfg.pub.releaseEnabled) return { status: 'error', message: 'Returning tickets is turned off right now.' };

  var email = String(data.email || '').trim();
  var last  = String(data.lastName || '').trim();
  var rows  = (data.rows || []).map(Number).filter(function (n) { return n > 1; });
  var waitRows = (data.waitRows || []).map(Number).filter(function (n) { return n > 1; });

  if (!email || !last) return { status: 'error', message: 'Enter both your email address and last name.' };
  if (!rows.length && !waitRows.length) return { status: 'error', message: 'Nothing was selected.' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {
    return { status: 'error', message: 'The system is busy. Please try again in a moment.' };
  }

  try {
    var wb = SpreadsheetApp.getActiveSpreadsheet();
    var stamp = now_();
    var released = [];

    if (rows.length) {
      var resvSheet = wb.getSheetByName(RESV_SHEET);
      var all = readReservations_();
      var byRow = {};
      all.forEach(function (r) { byRow[r._row] = r; });

      rows.forEach(function (rowNum) {
        var r = byRow[rowNum];
        // Re-verify ownership on the server; the row number alone proves nothing.
        if (!r || norm_(r['Email']) !== norm_(email) || norm_(r['Last Name']) !== norm_(last)) return;
        if (!isHeld_(r['Status'])) return;
        resvSheet.getRange(rowNum, colOnSheet_(resvSheet, 'Status')).setValue('Returned');
        resvSheet.getRange(rowNum, colOnSheet_(resvSheet, 'Last Updated')).setValue(stamp);
        released.push({ session: r['Session'], time: r['Session Time'], ticket: r['Ticket'],
                        first: r['First Name'], last: r['Last Name'] });
      });
    }

    var waitRemoved = 0;
    if (waitRows.length) {
      var waitSheet = wb.getSheetByName(WAIT_SHEET);
      var wAll = readWaitList_();
      var wByRow = {};
      wAll.forEach(function (w) { wByRow[w._row] = w; });
      waitRows.forEach(function (rowNum) {
        var w = wByRow[rowNum];
        if (!w || norm_(w['Email']) !== norm_(email) || norm_(w['Last Name']) !== norm_(last)) return;
        waitSheet.getRange(rowNum, colOnSheet_(waitSheet, 'Status')).setValue('Cancelled');
        waitSheet.getRange(rowNum, colOnSheet_(waitSheet, 'Last Updated')).setValue(stamp);
        waitRemoved++;
      });
    }

    SpreadsheetApp.flush();

    if (!released.length && !waitRemoved) {
      return { status: 'error', message: 'Nothing matched. Those tickets may already have been returned.' };
    }

    var who = released.length ? released[0].first + ' ' + released[0].last : last;
    if (released.length) {
      log_('Returned', who, email,
           released.map(function (r) { return r.session; }).filter(unique_).join(', '),
           released.map(function (r) { return r.ticket; }).join('; '),
           released.length + ' ticket(s) returned to circulation by the requester.');
    }
    if (waitRemoved) {
      log_('Wait List Cancelled', who, email, '', '', waitRemoved + ' wait list entr(y/ies) cancelled by the requester.');
    }

    notifyRelease_(cfg, { email: email, name: who, released: released, waitRemoved: waitRemoved });

    return {
      status: 'ok',
      releasedCount: released.length,
      waitRemoved: waitRemoved,
      message: released.length
        ? released.length + ' ticket' + (released.length === 1 ? '' : 's') + ' returned. Thank you!'
        : 'Wait list entry cancelled.'
    };
  } finally {
    lock.releaseLock();
  }
}

/* ================================================================== ADMIN */

function handleAdmin_(data, cfg) {
  var check = checkAdmin_(cfg, data.passcode);
  if (!check.ok) return { status: 'error', code: 'auth', message: check.message };

  var op = data.op || '';
  var wb = SpreadsheetApp.getActiveSpreadsheet();
  var stamp = now_();

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {
    return { status: 'error', message: 'The system is busy. Please try again in a moment.' };
  }

  try {
    if (op === 'setStatus') {
      var sheet = wb.getSheetByName(RESV_SHEET);
      var all = readReservations_();
      var byRow = {};
      all.forEach(function (r) { byRow[r._row] = r; });

      var newStatus = String(data.status || '').trim() || 'Requested';
      var touched = [];
      (data.rows || []).map(Number).forEach(function (rowNum) {
        var r = byRow[rowNum];
        if (!r) return;
        sheet.getRange(rowNum, colOnSheet_(sheet, 'Status')).setValue(newStatus);
        sheet.getRange(rowNum, colOnSheet_(sheet, 'Last Updated')).setValue(stamp);
        touched.push(r);
      });
      SpreadsheetApp.flush();

      if (!touched.length) return { status: 'error', message: 'No matching reservations found.' };

      log_('Admin: ' + newStatus, touched[0]['First Name'] + ' ' + touched[0]['Last Name'], touched[0]['Email'],
           touched.map(function (r) { return r['Session']; }).filter(unique_).join(', '),
           touched.map(function (r) { return r['Ticket']; }).join('; '),
           touched.length + ' reservation(s) set to ' + newStatus + ' from the admin screen.');

      if (FREED_STATUSES.indexOf(norm_(newStatus)) !== -1) {
        notifyAdminOnly_(cfg, 'Tickets returned to circulation',
          touched.length + ' ticket(s) were set to ' + newStatus + ' from the admin screen and are available again:<br><br>' +
          touched.map(function (r) { return escapeHtml_(r['Session'] + ' — ' + r['Ticket'] + ' (was ' + r['First Name'] + ' ' + r['Last Name'] + ')'); }).join('<br>'));
      }

      return { status: 'ok', message: touched.length + ' reservation(s) set to ' + newStatus + '.' };
    }

    if (op === 'setWaitStatus') {
      var wSheet = wb.getSheetByName(WAIT_SHEET);
      var wAll = readWaitList_();
      var wByRow = {};
      wAll.forEach(function (w) { wByRow[w._row] = w; });
      var wStatus = String(data.status || 'Waiting').trim();
      var wTouched = 0;
      (data.rows || []).map(Number).forEach(function (rowNum) {
        if (!wByRow[rowNum]) return;
        wSheet.getRange(rowNum, colOnSheet_(wSheet, 'Status')).setValue(wStatus);
        wSheet.getRange(rowNum, colOnSheet_(wSheet, 'Last Updated')).setValue(stamp);
        wTouched++;
      });
      SpreadsheetApp.flush();
      if (!wTouched) return { status: 'error', message: 'No matching wait list entries found.' };
      log_('Admin: Wait List ' + wStatus, '', '', '', '', wTouched + ' wait list entr(y/ies) set to ' + wStatus + '.');
      return { status: 'ok', message: wTouched + ' wait list entr(y/ies) set to ' + wStatus + '.' };
    }

    return { status: 'error', message: 'Unknown admin operation: ' + op };
  } finally {
    lock.releaseLock();
  }
}

/* ================================================================== EMAIL */

/**
 * The "can't use them?" call to action. This is the primary instruction in a
 * confirmation email — returning tickets is self-service, so the goal is to get
 * people to the form rather than into an email thread.
 */
function returnBlock_(cfg) {
  var url = String(cfg.pub.appUrl || '').trim();
  var cta = url
    ? '<p style="margin:0"><a href="' + escapeHtml_(url) + '#return" ' +
      'style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;' +
      'font-weight:700;padding:11px 22px;border-radius:8px">Return my tickets</a></p>'
    : '<p style="margin:0"><strong>Use the “Give tickets back” button</strong> on the page where you ' +
      'requested them.</p>';

  return '<div style="background:#f3f4f6;border-left:4px solid #4f46e5;border-radius:8px;' +
         'padding:16px 20px;margin:20px 0">' +
         '<p style="margin:0 0 6px;font-size:16px;font-weight:700">Can’t use your tickets?</p>' +
         '<p style="margin:0 0 14px;color:#374151">Please return them as soon as you know, so someone ' +
         'on the wait list can use them. It only takes a moment.</p>' +
         cta +
         '</div>';
}

function notifyReserve_(cfg, info) {
  var out = { requester: false, admin: false };
  var ticketRows = info.tickets.map(function (t) {
    return '<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">' + escapeHtml_(t) + '</td></tr>';
  }).join('');

  if (cfg.pub.sendConfirmation && info.email) {
    var body =
      '<h2 style="margin:0 0 4px">Your General Conference ticket request</h2>' +
      '<p style="margin:0 0 16px;color:#4b5563">' + escapeHtml_(cfg.pub.eventSubtitle || '') + '</p>' +
      '<p>Hi ' + escapeHtml_(info.first) + ', thanks for your request. Here is what you asked for:</p>' +
      '<p style="font-size:16px"><strong>' + escapeHtml_(info.session) + '</strong>' +
      (info.time ? ' &middot; ' + escapeHtml_(info.time) : '') + '</p>' +
      '<table style="border-collapse:collapse;border:1px solid #e5e7eb;margin:8px 0 16px">' + ticketRows + '</table>' +
      '<p><strong>' + info.tickets.length + ' ticket' + (info.tickets.length === 1 ? '' : 's') + '</strong> ' +
      (info.tickets.length === 1 ? 'is' : 'are') + ' now held for you. ' +
      'We will be in touch once they are secured.</p>' +
      returnBlock_(cfg) +
      '<p style="color:#6b7280;font-size:13px;margin:16px 0 0">Questions, or need a hand? Just reply to this email' +
      (cfg.pub.supportEmail ? ' or write to ' + escapeHtml_(cfg.pub.supportEmail) : '') + '.</p>' +
      '<p style="color:#9ca3af;font-size:12px">Reference: ' + escapeHtml_(info.requestId) + '</p>';

    out.requester = sendMail_(info.email,
      'Your ticket request — ' + info.session + ' (' + info.tickets.length + ')',
      body, cfg);
  }

  if (cfg.pub.notifyAdminOnRequest) {
    var adminBody =
      '<h2 style="margin:0 0 12px">New ticket request</h2>' +
      '<p style="font-size:16px;margin:0 0 4px"><strong>' + escapeHtml_(info.first + ' ' + info.last) + '</strong> — ' +
      info.tickets.length + ' ticket' + (info.tickets.length === 1 ? '' : 's') + '</p>' +
      '<p style="margin:0 0 16px"><strong>' + escapeHtml_(info.session) + '</strong>' +
      (info.time ? ' &middot; ' + escapeHtml_(info.time) : '') + '</p>' +
      '<table style="border-collapse:collapse;border:1px solid #e5e7eb;margin:0 0 16px">' + ticketRows + '</table>' +
      '<p style="margin:0"><strong>Email:</strong> <a href="mailto:' + escapeHtml_(info.email) + '">' + escapeHtml_(info.email) + '</a></p>' +
      '<p style="margin:0"><strong>Phone:</strong> ' + escapeHtml_(info.phone) + '</p>' +
      '<p style="margin:0"><strong>Ward / Branch:</strong> ' + escapeHtml_(info.ward || '—') + '</p>' +
      (info.notes ? '<p style="margin:8px 0 0"><strong>Notes:</strong> ' + escapeHtml_(info.notes) + '</p>' : '') +
      '<p style="margin:16px 0 0"><a href="' + cfg.pub.sheetUrl + '">Open the spreadsheet</a></p>';

    out.admin = sendMail_(cfg._private.adminEmail,
      'Ticket request: ' + info.first + ' ' + info.last + ' — ' + info.tickets.length + ' for ' + info.session,
      adminBody, cfg);
  }

  return out;
}

function notifyWaitlist_(cfg, info) {
  var out = { requester: false, admin: false };

  if (cfg.pub.sendConfirmation && info.email) {
    out.requester = sendMail_(info.email, "You're on the wait list — " + info.session,
      '<h2 style="margin:0 0 12px">You are on the wait list</h2>' +
      '<p>Hi ' + escapeHtml_(info.first) + ', we have you down for up to <strong>' + info.count +
      ' ticket' + (info.count === 1 ? '' : 's') + '</strong> for <strong>' + escapeHtml_(info.session) + '</strong>.</p>' +
      '<p>If tickets are returned, we will contact you at this address' +
      (info.phone ? ' or at ' + escapeHtml_(info.phone) : '') + '.</p>' +
      (cfg.pub.supportEmail ? '<p style="color:#4b5563;font-size:13px">Questions? Write to ' + escapeHtml_(cfg.pub.supportEmail) + '.</p>' : ''),
      cfg);
  }

  if (cfg.pub.notifyAdminOnWaitList) {
    out.admin = sendMail_(cfg._private.adminEmail,
      'Wait list: ' + info.first + ' ' + info.last + ' — ' + info.count + ' for ' + info.session,
      '<h2 style="margin:0 0 12px">New wait list entry</h2>' +
      '<p style="margin:0 0 4px"><strong>' + escapeHtml_(info.first + ' ' + info.last) + '</strong></p>' +
      '<p style="margin:0 0 4px"><strong>Session:</strong> ' + escapeHtml_(info.session) + '</p>' +
      '<p style="margin:0 0 4px"><strong>Tickets wanted:</strong> ' + info.count + '</p>' +
      '<p style="margin:0"><strong>Email:</strong> <a href="mailto:' + escapeHtml_(info.email) + '">' + escapeHtml_(info.email) + '</a></p>' +
      '<p style="margin:0"><strong>Phone:</strong> ' + escapeHtml_(info.phone) + '</p>' +
      '<p style="margin:0"><strong>Ward / Branch:</strong> ' + escapeHtml_(info.ward || '—') + '</p>' +
      (info.notes ? '<p style="margin:8px 0 0"><strong>Notes:</strong> ' + escapeHtml_(info.notes) + '</p>' : '') +
      '<p style="margin:16px 0 0"><a href="' + cfg.pub.sheetUrl + '">Open the spreadsheet</a></p>',
      cfg);
  }

  return out;
}

function notifyRelease_(cfg, info) {
  if (info.released.length && cfg.pub.sendConfirmation && info.email) {
    sendMail_(info.email, 'Your tickets have been returned',
      '<h2 style="margin:0 0 12px">Thanks — your tickets are back in circulation</h2>' +
      '<p>We have returned the following to the pool and will offer them to people on the wait list:</p>' +
      '<table style="border-collapse:collapse;border:1px solid #e5e7eb;margin:8px 0 16px">' +
      info.released.map(function (r) {
        return '<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">' +
               escapeHtml_(r.session + ' — ' + r.ticket) + '</td></tr>';
      }).join('') + '</table>' +
      (cfg.pub.supportEmail ? '<p style="color:#4b5563;font-size:13px">If this was a mistake, contact ' + escapeHtml_(cfg.pub.supportEmail) + ' right away.</p>' : ''),
      cfg);
  }

  if (cfg.pub.notifyAdminOnRelease) {
    sendMail_(cfg._private.adminEmail,
      'Tickets returned: ' + info.name + ' — ' + info.released.length,
      '<h2 style="margin:0 0 12px">Tickets returned to circulation</h2>' +
      '<p><strong>' + escapeHtml_(info.name) + '</strong> (' + escapeHtml_(info.email) + ') returned ' +
      info.released.length + ' ticket' + (info.released.length === 1 ? '' : 's') + '.</p>' +
      '<table style="border-collapse:collapse;border:1px solid #e5e7eb;margin:8px 0 16px">' +
      info.released.map(function (r) {
        return '<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">' +
               escapeHtml_(r.session + (r.time ? ' (' + r.time + ')' : '') + ' — ' + r.ticket) + '</td></tr>';
      }).join('') + '</table>' +
      (info.waitRemoved ? '<p>They also cancelled ' + info.waitRemoved + ' wait list entr(y/ies).</p>' : '') +
      '<p style="margin:16px 0 0"><a href="' + cfg.pub.sheetUrl + '">Open the spreadsheet</a></p>',
      cfg);
  }
}

function notifyAdminOnly_(cfg, subject, html) {
  sendMail_(cfg._private.adminEmail, subject, '<div>' + html + '</div>', cfg);
}

function sendMail_(to, subject, innerHtml, cfg) {
  if (!to) return false;
  try {
    MailApp.sendEmail({
      to: to,
      subject: subject,
      htmlBody: '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111827;max-width:640px">' +
                innerHtml + '</div>',
      replyTo: cfg._private.replyToEmail || undefined,
      name: cfg.pub.eventSubtitle || 'General Conference Tickets'
    });
    return true;
  } catch (err) {
    // Never let a mail failure roll back a reservation that is already written.
    log_('Email Failed', '', to, '', '', subject + ' — ' + String(err));
    return false;
  }
}

/* ================================================================ HELPERS */

function log_(action, name, email, session, tickets, details) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOG_SHEET);
    if (!sheet) return;
    sheet.appendRow([now_(), action, name || '', email || '', session || '', tickets || '', details || '']);
  } catch (e) { /* logging must never break a request */ }
}

function now_() {
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  return Utilities.formatDate(new Date(), tz, 'MM/dd/yyyy HH:mm:ss');
}

function norm_(v) {
  return String(v === undefined || v === null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' ');
}

function toBool_(v) {
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'y' || s === '1' || s === 'on';
}

function unique_(v, i, arr) {
  return v && arr.indexOf(v) === i;
}

function validateContact_(first, last, email, phone, ward) {
  if (!first) return 'Please enter your first name.';
  if (!last) return 'Please enter your last name.';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
  if (!phone || String(phone).replace(/\D/g, '').length < 10) return 'Please enter a 10-digit phone number.';
  if (!ward) return 'Please choose your ward or branch.';
  return '';
}

function escapeHtml_(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

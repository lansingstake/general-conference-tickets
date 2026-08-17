import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Download,
  ExternalLink,
  History,
  Lock,
  Mail,
  Moon,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sun,
  Ticket,
  Undo2,
  Users,
  XCircle,
} from 'lucide-react';
import { ApiError, fetchAdmin, post } from '../api';
import type { AdminPayload, Reservation, ToastMessage } from '../types';

const PASSCODE_KEY = 'gc_tickets_admin_passcode';

type Tab = 'tickets' | 'requests' | 'waitlist' | 'log';

interface Props {
  scriptUrl: string;
  addToast: (type: ToastMessage['type'], text: string) => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
}

/** A flattened ticket row: every ticket in the grid, reserved or not. */
interface TicketRow {
  sessionKey: string;
  session: string;
  time: string;
  label: string;
  status: string;
  reservation: Reservation | null;
}

// 'released' is the pre-rename spelling; kept so older rows still read as freed.
const FREED = ['returned', 'released', 'declined', 'cancelled', 'canceled'];
const isHeld = (status: string) => !FREED.includes(status.trim().toLowerCase());

/** Treats the pre-rename 'Released' as the same thing as 'Returned'. */
function matchesStatus(status: string, filter: string): boolean {
  const s = status.trim().toLowerCase();
  if (filter === 'returned') return s === 'returned' || s === 'released';
  return s === filter;
}

function statusBadgeClass(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === 'available') return 'badge-available';
  if (s === 'requested') return 'badge-limited';
  if (s === 'forwarded') return 'badge-info';
  if (FREED.includes(s)) return 'badge-neutral';
  return 'badge-full';
}

function toCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
}

function downloadCsv(filename: string, rows: string[][]) {
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminView({ scriptUrl, addToast, theme, setTheme }: Props) {
  const [passcode, setPasscode] = useState(() => sessionStorage.getItem(PASSCODE_KEY) || '');
  const [passcodeDraft, setPasscodeDraft] = useState('');
  const [needsPasscode, setNeedsPasscode] = useState(false);

  const [data, setData] = useState<AdminPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [tab, setTab] = useState<Tab>('tickets');
  const [search, setSearch] = useState('');
  const [sessionFilter, setSessionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [picked, setPicked] = useState<number[]>([]);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const payload = await fetchAdmin(scriptUrl, passcode);
        setData(payload);
        setNeedsPasscode(false);
        setError('');
      } catch (err) {
        if (err instanceof ApiError && err.code === 'auth') {
          setNeedsPasscode(true);
        } else {
          setError(err instanceof ApiError ? err.message : String(err));
        }
      } finally {
        setLoading(false);
      }
    },
    [scriptUrl, passcode]
  );

  useEffect(() => {
    load();
  }, [load]);

  /* ------------------------------------------------------------ derived */

  const ticketRows: TicketRow[] = useMemo(() => {
    if (!data) return [];
    return data.sessions.flatMap((s) =>
      s.tickets.map((t) => ({
        sessionKey: s.key,
        session: s.name,
        time: s.time,
        label: t.label,
        status: t.status,
        reservation: t.reservation,
      }))
    );
  }, [data]);

  const stats = useMemo(() => {
    const total = ticketRows.length;
    const held = ticketRows.filter((r) => r.reservation && isHeld(r.status)).length;
    const forwarded = ticketRows.filter((r) => r.status.toLowerCase() === 'forwarded').length;
    const waiting = data?.waitList.filter((w) => (w.status || 'Waiting').toLowerCase() === 'waiting') || [];
    const waitingTickets = waiting.reduce((sum, w) => sum + (parseInt(w.ticketsWanted, 10) || 0), 0);
    const people = new Set(
      ticketRows.filter((r) => r.reservation && isHeld(r.status)).map((r) => r.reservation!.email.toLowerCase())
    ).size;
    return { total, held, available: total - held, forwarded, waiting: waiting.length, waitingTickets, people };
  }, [ticketRows, data]);

  const filteredTickets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return ticketRows.filter((r) => {
      if (sessionFilter !== 'all' && r.sessionKey !== sessionFilter) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'available' && r.reservation) return false;
        if (statusFilter !== 'available' && !matchesStatus(r.status, statusFilter)) return false;
      }
      if (!term) return true;
      const haystack = [
        r.label,
        r.session,
        r.status,
        r.reservation?.firstName,
        r.reservation?.lastName,
        r.reservation?.email,
        r.reservation?.phone,
        r.reservation?.ward,
        r.reservation?.notes,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [ticketRows, search, sessionFilter, statusFilter]);

  /** One entry per submitted request, so you see a family's tickets together. */
  const requestGroups = useMemo(() => {
    if (!data) return [];
    const map = new Map<
      string,
      {
        requestId: string;
        firstName: string;
        lastName: string;
        email: string;
        phone: string;
        ward: string;
        session: string;
        sessionTime: string;
        timestamp: string;
        notes: string;
        statuses: Set<string>;
        rows: number[];
        tickets: string[];
      }
    >();

    data.reservations.forEach((r) => {
      const key = `${r.requestId}||${r.session}`;
      let g = map.get(key);
      if (!g) {
        g = {
          requestId: r.requestId,
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email,
          phone: r.phone,
          ward: r.ward,
          session: r.session,
          sessionTime: r.sessionTime,
          timestamp: r.timestamp,
          notes: r.notes,
          statuses: new Set(),
          rows: [],
          tickets: [],
        };
        map.set(key, g);
      }
      g.statuses.add(r.status || 'Requested');
      g.rows.push(r.row);
      g.tickets.push(r.ticket);
    });

    const term = search.trim().toLowerCase();
    return Array.from(map.values())
      .filter((g) => {
        if (statusFilter !== 'all' && statusFilter !== 'available') {
          if (!Array.from(g.statuses).some((s) => matchesStatus(s, statusFilter))) return false;
        }
        if (!term) return true;
        return [g.firstName, g.lastName, g.email, g.phone, g.ward, g.session, g.tickets.join(' '), g.notes]
          .join(' ')
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  }, [data, search, statusFilter]);

  const filteredWaitList = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    return data.waitList.filter((w) => {
      if (!term) return true;
      return [w.firstName, w.lastName, w.email, w.phone, w.ward, w.session, w.notes, w.status]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [data, search]);

  /* ------------------------------------------------------------- actions */

  const runAdmin = async (payload: Record<string, unknown>, successFallback: string) => {
    setBusy(true);
    try {
      const res = await post<{ message: string }>(scriptUrl, { action: 'admin', passcode, ...payload });
      addToast('success', res.message || successFallback);
      setPicked([]);
      await load(true);
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (rows: number[], status: string) => {
    if (!rows.length) return;
    if (status === 'Returned' && !window.confirm(`Put ${rows.length} ticket(s) back into circulation?`)) return;
    runAdmin({ op: 'setStatus', rows, status }, 'Updated.');
  };

  const setWaitStatus = (rows: number[], status: string) =>
    runAdmin({ op: 'setWaitStatus', rows, status }, 'Wait list updated.');

  const togglePick = (row: number) =>
    setPicked((prev) => (prev.includes(row) ? prev.filter((r) => r !== row) : [...prev, row]));

  const exportTickets = () => {
    const rows: string[][] = [
      ['Session', 'Time', 'Ticket', 'Status', 'First Name', 'Last Name', 'Email', 'Phone', 'Ward / Branch', 'Requested', 'Notes'],
      ...filteredTickets.map((r) => [
        r.session,
        r.time,
        r.label,
        r.status,
        r.reservation?.firstName || '',
        r.reservation?.lastName || '',
        r.reservation?.email || '',
        r.reservation?.phone || '',
        r.reservation?.ward || '',
        r.reservation?.timestamp || '',
        r.reservation?.notes || '',
      ]),
    ];
    downloadCsv('conference-tickets.csv', rows);
  };

  const exportWaitList = () => {
    const rows: string[][] = [
      ['Timestamp', 'Session', 'First Name', 'Last Name', 'Email', 'Phone', 'Ward / Branch', 'Tickets Wanted', 'Status', 'Notes'],
      ...filteredWaitList.map((w) => [
        w.timestamp,
        w.session,
        w.firstName,
        w.lastName,
        w.email,
        w.phone,
        w.ward,
        w.ticketsWanted,
        w.status,
        w.notes,
      ]),
    ];
    downloadCsv('conference-wait-list.csv', rows);
  };

  const copyEmails = (emails: string[]) => {
    const unique = Array.from(new Set(emails.filter(Boolean)));
    navigator.clipboard
      .writeText(unique.join(', '))
      .then(() => addToast('success', `Copied ${unique.length} email address(es).`))
      .catch(() => addToast('error', 'Could not copy to the clipboard.'));
  };

  /* ------------------------------------------------------------ rendering */

  if (needsPasscode) {
    return (
      <div className="config-screen">
        <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--primary)' }}>
          <Lock size={40} />
        </div>
        <h2>Admin passcode</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.92rem' }}>
          Enter the passcode from the <strong>General Info</strong> tab.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sessionStorage.setItem(PASSCODE_KEY, passcodeDraft.trim());
            setPasscode(passcodeDraft.trim());
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <input
            type="password"
            className="input-text"
            value={passcodeDraft}
            onChange={(e) => setPasscodeDraft(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn btn-primary">
            Unlock
          </button>
        </form>
        <a href="#" className="chip-btn" style={{ alignSelf: 'center' }}>
          <ArrowLeft size={12} /> Back to the public page
        </a>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <div className="loading-text">Loading admin data…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="config-screen">
        <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--danger)' }}>
          <AlertTriangle size={40} />
        </div>
        <h2>Could not load admin data</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-line' }}>{error}</p>
        <button className="btn btn-primary" onClick={() => load()}>
          Try again
        </button>
      </div>
    );
  }

  const pickedHeld = picked.filter((row) =>
    data.reservations.some((r) => r.row === row && isHeld(r.status))
  );

  return (
    <>
      <div className="admin-bar">
        <div>
          <h1 className="admin-title">
            <ShieldCheck size={26} style={{ color: 'var(--primary)' }} /> Ticket admin
          </h1>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            {data.config.eventName}
            {data.config.eventDates ? ` · ${data.config.eventDates}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="chip-btn" onClick={() => load()} disabled={busy || loading}>
            <RefreshCw size={12} className={loading ? 'spin-icon' : undefined} /> Refresh
          </button>
          <button className="chip-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? <Moon size={12} /> : <Sun size={12} />} {theme === 'light' ? 'Dark' : 'Light'}
          </button>
          {data.config.sheetUrl && (
            <a className="chip-btn" href={data.config.sheetUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={12} /> Spreadsheet
            </a>
          )}
          <a className="chip-btn accent" href="#">
            <ArrowLeft size={12} /> Public page
          </a>
        </div>
      </div>

      {!data.passcodeRequired && (
        <div className="warning-label" style={{ marginBottom: '1.25rem' }}>
          <AlertTriangle size={16} />
          <span>
            This screen has no passcode. Anyone who finds the link can see names, emails and phone numbers. To
            lock it, put a value in <strong>Admin Passcode</strong> on the General Info tab.
          </span>
        </div>
      )}

      {data.orphanReservations.length > 0 && (
        <div className="warning-label" style={{ marginBottom: '1.25rem' }}>
          <AlertTriangle size={16} />
          <span>
            {data.orphanReservations.length} reservation(s) point at a session that is no longer in the Tickets
            grid — likely a renamed or deleted column. Those tickets are not being held. Affected:{' '}
            {Array.from(new Set(data.orphanReservations.map((r) => r.session))).join(', ')}
          </span>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Tickets total</div>
        </div>
        <div className="stat-card good">
          <div className="stat-value">{stats.available}</div>
          <div className="stat-label">Still available</div>
        </div>
        <div className="stat-card warn">
          <div className="stat-value">{stats.held}</div>
          <div className="stat-label">Spoken for</div>
        </div>
        <div className="stat-card info">
          <div className="stat-value">{stats.forwarded}</div>
          <div className="stat-label">Forwarded</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.people}</div>
          <div className="stat-label">People holding</div>
        </div>
        <div className="stat-card info">
          <div className="stat-value">{stats.waiting}</div>
          <div className="stat-label">On wait list ({stats.waitingTickets} tickets)</div>
        </div>
      </div>

      <div className="tab-bar">
        <button className={`tab-btn${tab === 'tickets' ? ' active' : ''}`} onClick={() => setTab('tickets')}>
          <Ticket size={15} /> Tickets ({ticketRows.length})
        </button>
        <button className={`tab-btn${tab === 'requests' ? ' active' : ''}`} onClick={() => setTab('requests')}>
          <Users size={15} /> Requests ({requestGroups.length})
        </button>
        <button className={`tab-btn${tab === 'waitlist' ? ' active' : ''}`} onClick={() => setTab('waitlist')}>
          <Mail size={15} /> Wait list ({data.waitList.length})
        </button>
        <button className={`tab-btn${tab === 'log' ? ' active' : ''}`} onClick={() => setTab('log')}>
          <History size={15} /> Change log
        </button>
      </div>

      <div className="filter-bar">
        <div className="search-wrap">
          <Search size={16} />
          <input
            className="input-text"
            placeholder="Search name, email, phone, ticket…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {tab === 'tickets' && (
          <select
            className="input-select"
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
          >
            <option value="all">All sessions</option>
            {data.sessions.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        {(tab === 'tickets' || tab === 'requests') && (
          <select className="input-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Any status</option>
            <option value="available">Available</option>
            <option value="requested">Requested</option>
            <option value="forwarded">Forwarded</option>
            <option value="returned">Returned</option>
            <option value="declined">Declined</option>
          </select>
        )}
        {tab === 'tickets' && (
          <button className="btn btn-ghost btn-sm" onClick={exportTickets}>
            <Download size={14} /> Export CSV
          </button>
        )}
        {tab === 'waitlist' && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={exportWaitList}>
              <Download size={14} /> Export CSV
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => copyEmails(filteredWaitList.map((w) => w.email))}
            >
              <Mail size={14} /> Copy emails
            </button>
          </>
        )}
      </div>

      {picked.length > 0 && (tab === 'tickets' || tab === 'requests') && (
        <div className="bulk-bar">
          <span>{picked.length} selected</span>
          <button className="btn btn-success btn-sm" onClick={() => setStatus(picked, 'Forwarded')} disabled={busy}>
            <Send size={13} /> Mark forwarded
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setStatus(picked, 'Requested')} disabled={busy}>
            Back to requested
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => setStatus(pickedHeld, 'Returned')}
            disabled={busy || !pickedHeld.length}
          >
            <Undo2 size={13} /> Return ({pickedHeld.length})
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setStatus(picked, 'Declined')} disabled={busy}>
            <XCircle size={13} /> Decline
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPicked([])}>
            Clear
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------ TICKETS */}
      {tab === 'tickets' && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 34 }} />
                <th>Ticket</th>
                <th>Session</th>
                <th>Status</th>
                <th>Reserved by</th>
                <th>Ward / Branch</th>
                <th>Contact</th>
                <th>Requested</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No tickets match those filters.
                  </td>
                </tr>
              )}
              {filteredTickets.map((r) => {
                const res = r.reservation;
                const row = res?.row ?? -1;
                const checked = row > 0 && picked.includes(row);
                return (
                  <tr key={`${r.sessionKey}-${r.label}`} className={checked ? 'selected' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={checked}
                        disabled={!res}
                        onChange={() => row > 0 && togglePick(row)}
                      />
                    </td>
                    <td className="cell-mono">{r.label}</td>
                    <td>
                      <div className="cell-strong">{r.session}</div>
                      {r.time && <div className="cell-muted">{r.time}</div>}
                    </td>
                    <td>
                      <span className={`badge ${statusBadgeClass(r.status)}`}>{r.status}</span>
                    </td>
                    <td className="cell-strong">{res ? `${res.firstName} ${res.lastName}` : '—'}</td>
                    <td>{res?.ward || '—'}</td>
                    <td className="cell-contact">
                      {res ? (
                        <>
                          <div>
                            <a href={`mailto:${res.email}`}>{res.email}</a>
                          </div>
                          <div className="cell-muted">
                            <a href={`tel:${res.phone.replace(/\D/g, '')}`}>{res.phone}</a>
                          </div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="cell-muted">{res?.timestamp || '—'}</td>
                    <td>
                      {res ? (
                        <div className="cell-actions">
                          {res.status.toLowerCase() !== 'forwarded' && (
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => setStatus([res.row], 'Forwarded')}
                              disabled={busy}
                            >
                              Forwarded
                            </button>
                          )}
                          {isHeld(res.status) && (
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => setStatus([res.row], 'Returned')}
                              disabled={busy}
                            >
                              Return
                            </button>
                          )}
                          {!isHeld(res.status) && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setStatus([res.row], 'Requested')}
                              disabled={busy}
                            >
                              Re-hold
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="cell-muted">available</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ----------------------------------------------------------- REQUESTS */}
      {tab === 'requests' && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 34 }} />
                <th>Name</th>
                <th>Ward / Branch</th>
                <th>Contact</th>
                <th>Session</th>
                <th>Tickets</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requestGroups.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No requests match those filters.
                  </td>
                </tr>
              )}
              {requestGroups.map((g) => {
                // Group actions only ever touch tickets the person still holds.
                // Sweeping up returned rows would silently pull a ticket someone
                // gave back out of circulation again.
                const heldRows = g.rows.filter((row) =>
                  data.reservations.some((r) => r.row === row && isHeld(r.status))
                );
                const selectable = heldRows.length ? heldRows : g.rows;
                const allChecked = selectable.every((r) => picked.includes(r));
                return (
                  <tr key={`${g.requestId}-${g.session}`} className={allChecked ? 'selected' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={allChecked}
                        onChange={() =>
                          setPicked((prev) =>
                            allChecked
                              ? prev.filter((r) => !selectable.includes(r))
                              : Array.from(new Set([...prev, ...selectable]))
                          )
                        }
                      />
                    </td>
                    <td className="cell-strong">
                      {g.firstName} {g.lastName}
                      {g.notes && <div className="cell-muted">“{g.notes}”</div>}
                    </td>
                    <td>{g.ward || '—'}</td>
                    <td className="cell-contact">
                      <div>
                        <a href={`mailto:${g.email}`}>{g.email}</a>
                      </div>
                      <div className="cell-muted">
                        <a href={`tel:${g.phone.replace(/\D/g, '')}`}>{g.phone}</a>
                      </div>
                    </td>
                    <td>
                      <div className="cell-strong">{g.session}</div>
                      {g.sessionTime && <div className="cell-muted">{g.sessionTime}</div>}
                    </td>
                    <td>
                      <div className="cell-strong">
                        {heldRows.length}
                        {heldRows.length !== g.tickets.length && (
                          <span className="cell-muted"> of {g.tickets.length} still held</span>
                        )}
                      </div>
                      <div className="cell-muted" style={{ maxWidth: 260 }}>
                        {g.tickets.join(', ')}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {Array.from(g.statuses).map((s) => (
                          <span key={s} className={`badge ${statusBadgeClass(s)}`}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="cell-muted">{g.timestamp}</td>
                    <td>
                      <div className="cell-actions">
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => setStatus(heldRows, 'Forwarded')}
                          disabled={busy || !heldRows.length}
                        >
                          Forwarded
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setStatus(heldRows, 'Returned')}
                          disabled={busy || !heldRows.length}
                        >
                          Return all
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ----------------------------------------------------------- WAITLIST */}
      {tab === 'waitlist' && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Ward / Branch</th>
                <th>Contact</th>
                <th>Session</th>
                <th>Wants</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredWaitList.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    Nobody on the wait list yet.
                  </td>
                </tr>
              )}
              {filteredWaitList.map((w) => {
                const status = w.status || 'Waiting';
                return (
                  <tr key={w.row}>
                    <td className="cell-strong">
                      {w.firstName} {w.lastName}
                    </td>
                    <td>{w.ward || '—'}</td>
                    <td className="cell-contact">
                      <div>
                        <a href={`mailto:${w.email}`}>{w.email}</a>
                      </div>
                      <div className="cell-muted">
                        <a href={`tel:${w.phone.replace(/\D/g, '')}`}>{w.phone}</a>
                      </div>
                    </td>
                    <td className="cell-strong">{w.session}</td>
                    <td className="cell-strong">{w.ticketsWanted}</td>
                    <td>
                      <span
                        className={`badge ${
                          status.toLowerCase() === 'waiting'
                            ? 'badge-limited'
                            : status.toLowerCase() === 'fulfilled'
                            ? 'badge-available'
                            : 'badge-neutral'
                        }`}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="cell-muted">{w.timestamp}</td>
                    <td className="cell-muted" style={{ maxWidth: 220 }}>
                      {w.notes || '—'}
                    </td>
                    <td>
                      <div className="cell-actions">
                        <a
                          className="btn btn-ghost btn-sm"
                          href={`mailto:${w.email}?subject=${encodeURIComponent(
                            'General Conference tickets'
                          )}&body=${encodeURIComponent(
                            `Hi ${w.firstName},\n\nGood news — tickets have opened up for ${w.session}.\n\n`
                          )}`}
                        >
                          <Mail size={13} /> Email
                        </a>
                        {status.toLowerCase() === 'waiting' ? (
                          <>
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => setWaitStatus([w.row], 'Fulfilled')}
                              disabled={busy}
                            >
                              <CheckCircle size={13} /> Fulfilled
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setWaitStatus([w.row], 'Cancelled')}
                              disabled={busy}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setWaitStatus([w.row], 'Waiting')}
                            disabled={busy}
                          >
                            Re-open
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------------------------------------------------- CHANGE LOG */}
      {tab === 'log' && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Who</th>
                <th>Session</th>
                <th>Tickets</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {data.changeLog.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    Nothing logged yet.
                  </td>
                </tr>
              )}
              {data.changeLog.map((l) => (
                <tr key={l.row}>
                  <td className="cell-muted" style={{ whiteSpace: 'nowrap' }}>
                    {l.timestamp}
                  </td>
                  <td>
                    <span className="badge badge-neutral">{l.action}</span>
                  </td>
                  <td>
                    <div className="cell-strong">{l.name || '—'}</div>
                    <div className="cell-muted">{l.email}</div>
                  </td>
                  <td>{l.session || '—'}</td>
                  <td className="cell-muted" style={{ maxWidth: 260 }}>
                    {l.tickets || '—'}
                  </td>
                  <td className="cell-muted" style={{ maxWidth: 320 }}>
                    {l.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

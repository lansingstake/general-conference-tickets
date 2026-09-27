import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Info, Ticket, X } from 'lucide-react';
import type { AdminSession, WaitListEntry } from '../types';

interface Props {
  entry: WaitListEntry;
  sessions: AdminSession[];
  busy: boolean;
  onClose: () => void;
  onAssign: (args: {
    session: AdminSession;
    tickets: string[];
    notify: boolean;
    markForwarded: boolean;
  }) => void;
  onMarkFulfilledOnly: () => void;
}

const norm = (v: string) => (v || '').trim().toLowerCase();

export default function FulfilWaitListModal({
  entry,
  sessions,
  busy,
  onClose,
  onAssign,
  onMarkFulfilledOnly,
}: Props) {
  // The entry usually names a session. "Any Session", or a session since
  // renamed, leaves nothing to match — then it gets chosen here instead.
  const matched = sessions.find((s) => norm(s.name) === norm(entry.session));
  const [sessionKey, setSessionKey] = useState(matched?.key ?? sessions[0]?.key ?? '');
  const [picked, setPicked] = useState<string[]>([]);
  const [notify, setNotify] = useState(true);
  const [markForwarded, setMarkForwarded] = useState(false);

  const session = sessions.find((s) => s.key === sessionKey) || null;
  const available = useMemo(
    () => (session ? session.tickets.filter((t) => !t.reservation) : []),
    [session]
  );

  const wantedNumber = parseInt(entry.ticketsWanted, 10);
  const asked = Number.isNaN(wantedNumber) ? null : wantedNumber;

  const toggle = (label: string) =>
    setPicked((prev) => (prev.includes(label) ? prev.filter((t) => t !== label) : [...prev, label]));

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal-content wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>
              Give tickets to {entry.firstName} {entry.lastName}
            </h2>
            <div className="sub">
              Asked for {entry.ticketsWanted} · {entry.session}
              {entry.ward ? ` · ${entry.ward}` : ''}
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="modal-body">
          {sessions.length > 1 && (
            <div className="form-group">
              <label className="form-label" htmlFor="fw-session">
                Session to take tickets from
              </label>
              <select
                id="fw-session"
                className="input-select"
                value={sessionKey}
                onChange={(e) => {
                  setSessionKey(e.target.value);
                  setPicked([]);
                }}
                disabled={busy}
              >
                {sessions.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                    {s.time ? ` — ${s.time}` : ''} (
                    {s.tickets.filter((t) => !t.reservation).length} free)
                  </option>
                ))}
              </select>
              {!matched && (
                <span className="validation-error">
                  <AlertTriangle size={11} />
                  They asked for &ldquo;{entry.session}&rdquo;, so choose where these come from.
                </span>
              )}
            </div>
          )}

          <div
            className={`selection-counter${
              asked !== null && picked.length > asked ? ' at-limit' : ''
            }`}
          >
            <span>
              <strong>{picked.length}</strong> selected
              {asked !== null ? ` of the ${asked} they asked for` : ''}
            </span>
            <span>{available.length} free in this session</span>
          </div>

          <div className="form-group">
            <label className="form-label">Available tickets</label>
            {available.length === 0 ? (
              <div className="warning-label">
                <AlertTriangle size={16} />
                <span>
                  No free tickets in this session right now. You can still mark them fulfilled, or
                  wait until one comes back.
                </span>
              </div>
            ) : (
              <div className="ticket-chips">
                {available.map((t) => {
                  const isPicked = picked.includes(t.label);
                  return (
                    <button
                      key={t.label}
                      type="button"
                      className={`ticket-chip${isPicked ? ' picked' : ''}`}
                      onClick={() => toggle(t.label)}
                      disabled={busy}
                      title={t.label}
                    >
                      {isPicked && <Check size={12} />}
                      {t.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <label className="result-item">
            <input
              type="checkbox"
              className="checkbox"
              checked={notify}
              onChange={() => setNotify(!notify)}
              disabled={busy}
            />
            <div className="result-info">
              <span className="result-name">Email them their tickets</span>
              <div className="result-details">
                Sends {entry.email} the seat numbers and a link to hand them back.
              </div>
            </div>
          </label>

          <label className="result-item">
            <input
              type="checkbox"
              className="checkbox"
              checked={markForwarded}
              onChange={() => setMarkForwarded(!markForwarded)}
              disabled={busy}
            />
            <div className="result-info">
              <span className="result-name">The actual tickets have already been sent</span>
              <div className="result-details">
                Marks them Forwarded. Leave this unticked and they stay under &ldquo;Unfilled
                requests&rdquo; until you send them.
              </div>
            </div>
          </label>

          <div className="info-label">
            <Info size={16} />
            <span>
              These seats come out of circulation immediately, so nobody else can request them.
            </span>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-ghost" onClick={onMarkFulfilledOnly} disabled={busy}>
            Just mark fulfilled
          </button>
          <button
            className="btn btn-primary"
            style={{ width: 'auto' }}
            disabled={busy || !session || picked.length === 0}
            onClick={() => session && onAssign({ session, tickets: picked, notify, markForwarded })}
          >
            <Ticket size={16} />
            {busy
              ? 'Assigning…'
              : picked.length
              ? `Assign ${picked.length} ticket${picked.length === 1 ? '' : 's'}`
              : 'Assign tickets'}
          </button>
        </div>
      </div>
    </div>
  );
}

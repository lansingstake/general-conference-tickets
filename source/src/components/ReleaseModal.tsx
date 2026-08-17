import { useState } from 'react';
import { AlertTriangle, Check, Search, Undo2, X } from 'lucide-react';
import { ApiError, post } from '../api';
import type { LookupReservation, LookupWaitEntry, ToastMessage } from '../types';

interface Props {
  scriptUrl: string;
  supportEmail: string;
  onClose: () => void;
  onDone: () => void;
  addToast: (type: ToastMessage['type'], text: string) => void;
}

export default function ReleaseModal({ scriptUrl, supportEmail, onClose, onDone, addToast }: Props) {
  const [email, setEmail] = useState('');
  const [lastName, setLastName] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const [reservations, setReservations] = useState<LookupReservation[]>([]);
  const [waitList, setWaitList] = useState<LookupWaitEntry[]>([]);
  const [pickedTickets, setPickedTickets] = useState<number[]>([]);
  const [pickedWait, setPickedWait] = useState<number[]>([]);

  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !lastName.trim()) {
      setError('Enter both your email address and last name.');
      return;
    }
    setSearching(true);
    try {
      const data = await post<{ reservations: LookupReservation[]; waitList: LookupWaitEntry[] }>(scriptUrl, {
        action: 'lookup',
        email: email.trim(),
        lastName: lastName.trim(),
      });
      setReservations(data.reservations || []);
      setWaitList(data.waitList || []);
      setPickedTickets([]);
      setPickedWait([]);
      setSearched(true);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : String(err);
      setError(message);
    } finally {
      setSearching(false);
    }
  };

  const release = async () => {
    if (!pickedTickets.length && !pickedWait.length) return;
    setReleasing(true);
    setError('');
    try {
      const data = await post<{ message: string }>(scriptUrl, {
        action: 'release',
        email: email.trim(),
        lastName: lastName.trim(),
        rows: pickedTickets,
        waitRows: pickedWait,
      });
      setResult(data.message);
      addToast('success', data.message);
      onDone();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : String(err);
      setError(message);
      addToast('error', message);
    } finally {
      setReleasing(false);
    }
  };

  const toggleTicket = (row: number) =>
    setPickedTickets((prev) => (prev.includes(row) ? prev.filter((r) => r !== row) : [...prev, row]));

  const toggleWait = (row: number) =>
    setPickedWait((prev) => (prev.includes(row) ? prev.filter((r) => r !== row) : [...prev, row]));

  const totalPicked = pickedTickets.length + pickedWait.length;

  if (result) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Thank you</h2>
            <button className="modal-close-btn" onClick={onClose} aria-label="Close">
              <X size={22} />
            </button>
          </div>
          <div className="modal-body">
            <div className="info-label">
              <Check size={18} />
              <span>{result} They're back in circulation for someone on the wait list.</span>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={() => !releasing && !searching && onClose()}>
      <div className="modal-content wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Give tickets back</h2>
            <div className="sub">Find your request, then pick what you can't use.</div>
          </div>
          <button
            className="modal-close-btn"
            onClick={onClose}
            disabled={releasing || searching}
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </div>

        <div className="modal-body">
          <form onSubmit={lookup} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="rl-email">
                  Email you signed up with<span className="req">*</span>
                </label>
                <input
                  id="rl-email"
                  type="email"
                  className="input-text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={searching || releasing}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="rl-last">
                  Last name<span className="req">*</span>
                </label>
                <input
                  id="rl-last"
                  className="input-text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  disabled={searching || releasing}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-ghost" disabled={searching || releasing}>
              <Search size={16} />
              {searching ? 'Looking…' : 'Find my tickets'}
            </button>
          </form>

          {searched && reservations.length === 0 && waitList.length === 0 && (
            <div className="warning-label">
              <AlertTriangle size={16} />
              <span>
                Nothing found for that email and last name. Double-check the spelling
                {supportEmail ? (
                  <>
                    , or email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> and we'll sort it out
                  </>
                ) : null}
                .
              </span>
            </div>
          )}

          {reservations.length > 0 && (
            <div>
              <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem' }}>
                Your tickets — check what you'd like to hand back
              </label>
              <div className="result-list">
                {reservations.map((r) => (
                  <label key={r.row} className="result-item">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={pickedTickets.includes(r.row)}
                      onChange={() => toggleTicket(r.row)}
                      disabled={releasing}
                    />
                    <div className="result-info">
                      <span className="result-name">{r.ticket}</span>
                      <div className="result-details">
                        <span className="badge badge-info">{r.session}</span>
                        {r.sessionTime && <span>{r.sessionTime}</span>}
                        <span className="badge badge-neutral">{r.status}</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {waitList.length > 0 && (
            <div>
              <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem' }}>
                Your wait list entries — check any you'd like to cancel
              </label>
              <div className="result-list">
                {waitList.map((w) => (
                  <label key={w.row} className="result-item">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={pickedWait.includes(w.row)}
                      onChange={() => toggleWait(w.row)}
                      disabled={releasing}
                    />
                    <div className="result-info">
                      <span className="result-name">{w.session}</span>
                      <div className="result-details">
                        <span>Waiting for up to {w.ticketsWanted} ticket(s)</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="warning-label">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={releasing}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={release} disabled={releasing || totalPicked === 0}>
            <Undo2 size={16} />
            {releasing ? 'Returning…' : `Give back ${totalPicked || ''} selected`}
          </button>
        </div>
      </div>
    </div>
  );
}

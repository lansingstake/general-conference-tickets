import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Clock, Info, Ticket, X } from 'lucide-react';
import { ApiError, newToken, post } from '../api';
import type { ContactDetails, PublicSession, ToastMessage } from '../types';
import ContactFields from './ContactFields';
import {
  loadSavedContact,
  resolveWard,
  saveContact,
  validateContact,
  type ContactErrors,
} from '../contact';

interface Props {
  session: PublicSession;
  /** Seats already chosen on the session card — the queue this modal confirms. */
  selected: string[];
  maxTickets: number;
  onRemove: (label: string) => void;
  scriptUrl: string;
  supportEmail: string;
  onClose: () => void;
  onSubmitted: () => void;
  onDone: () => void;
  addToast: (type: ToastMessage['type'], text: string) => void;
}

export default function ReserveModal({
  session,
  selected,
  maxTickets,
  onRemove,
  scriptUrl,
  supportEmail,
  onClose,
  onSubmitted,
  onDone,
  addToast,
}: Props) {
  const [contact, setContact] = useState<ContactDetails>(loadSavedContact);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [confirmed, setConfirmed] = useState<string[] | null>(null);

  /**
   * One token for the whole modal, not one per click. If a submission times out
   * after the server already wrote the rows, retrying with the same token is
   * recognised as the same request and returns success — a fresh token instead
   * would be treated as a second booking and rejected on the per-person cap.
   */
  const requestToken = useRef(newToken());

  const errors: ContactErrors = useMemo(() => validateContact(contact), [contact]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    setServerError('');

    if (!selected.length) {
      setServerError('No seats selected. Close this and tap the seats you want.');
      return;
    }
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    try {
      const result = await post<{ tickets: string[] }>(scriptUrl, {
        action: 'reserve',
        clientToken: requestToken.current,
        session: session.name,
        sessionTime: session.time,
        tickets: selected,
        firstName: contact.firstName.trim(),
        lastName: contact.lastName.trim(),
        email: contact.email.trim(),
        phone: contact.phone.trim(),
        ward: resolveWard(contact),
        notes: contact.notes.trim(),
      });
      saveContact(contact);
      setConfirmed(result.tickets || selected);
      addToast('success', `${(result.tickets || selected).length} ticket(s) reserved for you.`);
      onSubmitted();
      onDone();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : String(err);
      setServerError(message);
      // Someone beat them to a seat — pull fresh availability so the card updates.
      if (err instanceof ApiError && (err.code === 'taken' || err.code === 'stale')) onDone();
      addToast('error', message);
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmed) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <h2>You're all set</h2>
              <div className="sub">
                {session.name}
                {session.time ? ` · ${session.time}` : ''}
              </div>
            </div>
            <button className="modal-close-btn" onClick={onClose} aria-label="Close">
              <X size={22} />
            </button>
          </div>
          <div className="modal-body">
            <div className="info-label">
              <Check size={18} />
              <span>
                {confirmed.length} ticket{confirmed.length === 1 ? '' : 's'} held for {contact.firstName}{' '}
                {contact.lastName}. A confirmation was sent to {contact.email}.
              </span>
            </div>
            <div className="ticket-chips">
              {confirmed.map((t) => (
                <span key={t} className="ticket-chip" title={t}>
                  {t}
                </span>
              ))}
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
              We'll be in touch once the tickets are secured. If your plans change, use{' '}
              <strong>Give tickets back</strong> on the main page
              {supportEmail ? (
                <>
                  {' '}
                  or email <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
                </>
              ) : null}
              .
            </p>
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
    <div className="modal-overlay" onClick={() => !submitting && onClose()}>
      <form className="modal-content" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-header">
          <div>
            <h2>Almost there</h2>
            <div className="sub">
              {session.name}
              {session.time ? (
                <>
                  {' · '}
                  <Clock size={12} style={{ verticalAlign: '-1px' }} /> {session.time}
                </>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">
              Your seats ({selected.length} of {maxTickets})
            </label>
            {selected.length === 0 ? (
              <div className="warning-label">
                <AlertTriangle size={16} />
                <span>No seats selected. Close this and tap the seats you want.</span>
              </div>
            ) : (
              <>
                <div className="ticket-chips">
                  {selected.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="ticket-chip picked"
                      title={`Remove ${t}`}
                      onClick={() => onRemove(t)}
                      disabled={submitting}
                    >
                      {t}
                      <X size={12} />
                    </button>
                  ))}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Tap a seat to remove it.
                </span>
              </>
            )}
          </div>

          <div className="info-label">
            <Info size={16} />
            <span>
              Up to {maxTickets} tickets total per person, across every session. Need more? Add yourself to the
              wait list.
            </span>
          </div>

          <ContactFields
            value={contact}
            onChange={setContact}
            errors={errors}
            showErrors={showErrors}
            disabled={submitting}
          />

          {serverError && (
            <div className="warning-label">
              <AlertTriangle size={16} />
              <span>{serverError}</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: 'auto' }}
            disabled={submitting || selected.length === 0}
          >
            <Ticket size={16} />
            {submitting
              ? 'Requesting…'
              : `Confirm ${selected.length} ticket${selected.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </form>
    </div>
  );
}

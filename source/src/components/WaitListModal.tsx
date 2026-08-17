import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ListPlus, X } from 'lucide-react';
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

export const ANY_SESSION = 'Any Session';

interface Props {
  sessions: PublicSession[];
  initialSession: string;
  scriptUrl: string;
  onClose: () => void;
  onDone: () => void;
  addToast: (type: ToastMessage['type'], text: string) => void;
}

export default function WaitListModal({
  sessions,
  initialSession,
  scriptUrl,
  onClose,
  onDone,
  addToast,
}: Props) {
  const [session, setSession] = useState(initialSession);
  const [ticketsWanted, setTicketsWanted] = useState(1);
  const [contact, setContact] = useState<ContactDetails>(loadSavedContact);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [done, setDone] = useState(false);

  // One token per modal so a timed-out retry is not recorded twice.
  const requestToken = useRef(newToken());

  const errors: ContactErrors = useMemo(() => validateContact(contact), [contact]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    setServerError('');
    if (Object.keys(errors).length) return;
    if (!ticketsWanted || ticketsWanted < 1) {
      setServerError('Enter how many tickets you need.');
      return;
    }

    setSubmitting(true);
    try {
      await post(scriptUrl, {
        action: 'waitlist',
        clientToken: requestToken.current,
        session,
        ticketsWanted,
        firstName: contact.firstName.trim(),
        lastName: contact.lastName.trim(),
        email: contact.email.trim(),
        phone: contact.phone.trim(),
        ward: resolveWard(contact),
        notes: contact.notes.trim(),
      });
      saveContact(contact);
      setDone(true);
      addToast('success', `You're on the wait list for ${session}.`);
      onDone();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : String(err);
      setServerError(message);
      addToast('error', message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>You're on the wait list</h2>
            <button className="modal-close-btn" onClick={onClose} aria-label="Close">
              <X size={22} />
            </button>
          </div>
          <div className="modal-body">
            <div className="info-label">
              <Check size={18} />
              <span>
                We have you down for up to {ticketsWanted} ticket{ticketsWanted === 1 ? '' : 's'} for{' '}
                <strong>{session}</strong>. If tickets come back, we'll contact you at {contact.email}.
              </span>
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
    <div className="modal-overlay" onClick={() => !submitting && onClose()}>
      <form className="modal-content" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-header">
          <div>
            <h2>Join the wait list</h2>
            <div className="sub">We'll reach out if tickets are returned.</div>
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
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="wl-session">
                Which session<span className="req">*</span>
              </label>
              <select
                id="wl-session"
                className="input-select"
                value={session}
                onChange={(e) => setSession(e.target.value)}
                disabled={submitting}
              >
                {sessions.map((s) => (
                  <option key={s.key} value={s.name}>
                    {s.name}
                    {s.time ? ` — ${s.time}` : ''}
                  </option>
                ))}
                <option value={ANY_SESSION}>{ANY_SESSION}</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="wl-count">
                How many tickets<span className="req">*</span>
              </label>
              <input
                id="wl-count"
                type="number"
                min={1}
                max={20}
                className="input-number"
                value={Number.isNaN(ticketsWanted) ? '' : ticketsWanted}
                onChange={(e) => setTicketsWanted(parseInt(e.target.value, 10))}
                onBlur={() => {
                  if (Number.isNaN(ticketsWanted) || ticketsWanted < 1) setTicketsWanted(1);
                }}
                disabled={submitting}
              />
            </div>
          </div>

          <ContactFields
            value={contact}
            onChange={setContact}
            errors={errors}
            showErrors={showErrors}
            disabled={submitting}
            notesLabel="Comments"
            notesPlaceholder="e.g. we could use fewer if that's all that opens up"
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
          <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
            <ListPlus size={16} />
            {submitting ? 'Adding…' : 'Add me to the wait list'}
          </button>
        </div>
      </form>
    </div>
  );
}

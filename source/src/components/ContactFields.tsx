import { AlertTriangle } from 'lucide-react';
import type { ContactDetails } from '../types';
import { formatPhone, WARD_OPTIONS, WARD_OTHER, type ContactErrors } from '../contact';

interface Props {
  value: ContactDetails;
  onChange: (next: ContactDetails) => void;
  errors: ContactErrors;
  showErrors: boolean;
  disabled?: boolean;
  notesLabel?: string;
  notesPlaceholder?: string;
}

export default function ContactFields({
  value,
  onChange,
  errors,
  showErrors,
  disabled,
  notesLabel = 'Comments',
  notesPlaceholder = 'Anything we should know? (optional)',
}: Props) {
  const set = (patch: Partial<ContactDetails>) => onChange({ ...value, ...patch });

  const err = (field: keyof ContactDetails) =>
    showErrors && errors[field] ? (
      <span className="validation-error">
        <AlertTriangle size={11} />
        {errors[field]}
      </span>
    ) : null;

  const cls = (field: keyof ContactDetails) =>
    `input-text${showErrors && errors[field] ? ' error' : ''}`;

  return (
    <>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label" htmlFor="cf-first">
            First name<span className="req">*</span>
          </label>
          <input
            id="cf-first"
            className={cls('firstName')}
            value={value.firstName}
            onChange={(e) => set({ firstName: e.target.value })}
            autoComplete="given-name"
            disabled={disabled}
          />
          {err('firstName')}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="cf-last">
            Last name<span className="req">*</span>
          </label>
          <input
            id="cf-last"
            className={cls('lastName')}
            value={value.lastName}
            onChange={(e) => set({ lastName: e.target.value })}
            autoComplete="family-name"
            disabled={disabled}
          />
          {err('lastName')}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="cf-email">
            Email<span className="req">*</span>
          </label>
          <input
            id="cf-email"
            type="email"
            className={cls('email')}
            value={value.email}
            onChange={(e) => set({ email: e.target.value })}
            autoComplete="email"
            disabled={disabled}
          />
          {err('email')}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="cf-phone">
            Phone<span className="req">*</span>
          </label>
          <input
            id="cf-phone"
            type="tel"
            className={cls('phone')}
            value={value.phone}
            onChange={(e) => set({ phone: formatPhone(e.target.value) })}
            placeholder="(517) 555-0134"
            autoComplete="tel"
            disabled={disabled}
          />
          {err('phone')}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="cf-ward">
            Ward / Branch<span className="req">*</span>
          </label>
          <select
            id="cf-ward"
            className={`input-select${showErrors && errors.ward ? ' error' : ''}`}
            value={value.ward}
            onChange={(e) => set({ ward: e.target.value })}
            disabled={disabled}
          >
            <option value="">Choose one…</option>
            {WARD_OPTIONS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
            <option value={WARD_OTHER}>{WARD_OTHER}</option>
          </select>
          {err('ward')}
        </div>
        {value.ward === WARD_OTHER && (
          <div className="form-group">
            <label className="form-label" htmlFor="cf-ward-other">
              Which ward or branch?<span className="req">*</span>
            </label>
            <input
              id="cf-ward-other"
              className={cls('wardOther')}
              value={value.wardOther}
              onChange={(e) => set({ wardOther: e.target.value })}
              placeholder="Type your unit"
              disabled={disabled}
              autoFocus
            />
            {err('wardOther')}
          </div>
        )}
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="cf-notes">
          {notesLabel}
        </label>
        <textarea
          id="cf-notes"
          className="input-textarea"
          value={value.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder={notesPlaceholder}
          disabled={disabled}
        />
      </div>
    </>
  );
}

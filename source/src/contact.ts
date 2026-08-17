import type { ContactDetails } from './types';

/** Units in the Lansing Michigan Stake. 'Other' opens a free-text box. */
export const WARD_OPTIONS = [
  'Charlotte Branch',
  'Holt Ward',
  'Jackson Ward',
  'Lansing Ward',
  'Owosso Ward',
  'Portland Branch',
  'St Johns Branch',
  'Williamston Ward',
  'YSA Ward',
];

export const WARD_OTHER = 'Other';

export const EMPTY_CONTACT: ContactDetails = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  ward: '',
  wardOther: '',
  notes: '',
};

/** The single value stored in the sheet and shown in emails. */
export function resolveWard(c: ContactDetails): string {
  return c.ward === WARD_OTHER ? c.wardOther.trim() : c.ward.trim();
}

const CONTACT_KEY = 'gc_tickets_contact';

/** Remembering the contact details locally saves re-typing on a second request. */
export function loadSavedContact(): ContactDetails {
  try {
    const raw = localStorage.getItem(CONTACT_KEY);
    if (!raw) return { ...EMPTY_CONTACT };
    // Notes are per-request, so they are deliberately not restored.
    return { ...EMPTY_CONTACT, ...JSON.parse(raw), notes: '' };
  } catch {
    return { ...EMPTY_CONTACT };
  }
}

export function saveContact(c: ContactDetails) {
  try {
    localStorage.setItem(
      CONTACT_KEY,
      JSON.stringify({
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        ward: c.ward,
        wardOther: c.wardOther,
      })
    );
  } catch {
    /* private browsing — not worth surfacing */
  }
}

/** (517) 555-0134 as you type; anything not US-shaped is left alone. */
export function formatPhone(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 11);
  const local = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  if (local.length <= 3) return local;
  if (local.length <= 6) return `(${local.slice(0, 3)}) ${local.slice(3)}`;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6, 10)}`;
}

export type ContactErrors = Partial<Record<keyof ContactDetails, string>>;

export function validateContact(c: ContactDetails): ContactErrors {
  const errors: ContactErrors = {};
  if (!c.firstName.trim()) errors.firstName = 'First name is required';
  if (!c.lastName.trim()) errors.lastName = 'Last name is required';
  if (!c.email.trim()) errors.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) errors.email = 'Enter a valid email address';
  const digits = c.phone.replace(/\D/g, '');
  if (!digits) errors.phone = 'Phone number is required';
  else if (digits.length < 10) errors.phone = 'Enter a 10-digit phone number';
  if (!c.ward) errors.ward = 'Choose your ward or branch';
  else if (c.ward === WARD_OTHER && !c.wardOther.trim()) errors.wardOther = 'Enter your ward or branch';
  return errors;
}

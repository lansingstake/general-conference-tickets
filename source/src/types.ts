export interface AppConfig {
  eventName: string;
  eventSubtitle: string;
  eventDates: string;
  guidelines: string;
  headerNotice: string;
  supportEmail: string;
  appUrl: string;
  howToVideoUrl: string;
  refreshIntervalSeconds: number;
  maxTicketsPerPerson: number;
  requestsOpen: boolean;
  closedMessage: string;
  waitListEnabled: boolean;
  waitListAlwaysVisible: boolean;
  releaseEnabled: boolean;
  sendConfirmation: boolean;
  notifyAdminOnRequest: boolean;
  notifyAdminOnRelease: boolean;
  notifyAdminOnWaitList: boolean;
  sheetUrl: string;
}

/** A session as the public page sees it — only unclaimed tickets are listed. */
export interface PublicSession {
  key: string;
  name: string;
  time: string;
  total: number;
  available: number;
  tickets: string[];
  waitListCount: number;
}

export interface PublicPayload {
  status: 'ok';
  config: AppConfig;
  sessions: PublicSession[];
  anySessionWaitCount: number;
  serverTime: string;
}

export interface Reservation {
  row: number;
  timestamp: string;
  requestId: string;
  session: string;
  sessionTime: string;
  ticket: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  ward: string;
  status: string;
  notes: string;
  lastUpdated: string;
}

export interface AdminTicket {
  label: string;
  row: number;
  status: string;
  reservation: Reservation | null;
}

export interface AdminSession {
  key: string;
  name: string;
  time: string;
  duplicates: string[];
  tickets: AdminTicket[];
}

export interface WaitListEntry {
  row: number;
  timestamp: string;
  requestId: string;
  session: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  ward: string;
  ticketsWanted: string;
  notes: string;
  status: string;
}

export interface ChangeLogEntry {
  row: number;
  timestamp: string;
  action: string;
  name: string;
  email: string;
  session: string;
  tickets: string;
  details: string;
}

export interface AdminPayload {
  status: 'ok';
  config: AppConfig;
  passcodeRequired: boolean;
  adminEmail: string;
  sessions: AdminSession[];
  reservations: Reservation[];
  waitList: WaitListEntry[];
  orphanReservations: Reservation[];
  changeLog: ChangeLogEntry[];
  serverTime: string;
}

export interface LookupReservation {
  row: number;
  requestId: string;
  session: string;
  sessionTime: string;
  ticket: string;
  status: string;
  timestamp: string;
  sessionKey: string | null;
}

export interface LookupWaitEntry {
  row: number;
  session: string;
  ticketsWanted: string;
  requestId: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

export interface ContactDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** A value from WARD_OPTIONS, or 'Other' — in which case wardOther holds it. */
  ward: string;
  wardOther: string;
  notes: string;
}

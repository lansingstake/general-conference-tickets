import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  Info,
  ListPlus,
  Moon,
  Pause,
  Play,
  RefreshCw,
  Sun,
  Ticket,
  Undo2,
  Users,
} from 'lucide-react';
import type { PublicPayload, ToastMessage } from '../types';
import ReserveModal from './ReserveModal';
import WaitListModal, { ANY_SESSION } from './WaitListModal';
import ReleaseModal from './ReleaseModal';
import { useFitLabels } from '../useFitLabels';

interface Props {
  data: PublicPayload;
  scriptUrl: string;
  addToast: (type: ToastMessage['type'], text: string) => void;
  reload: () => void;
  autoRefresh: boolean;
  setAutoRefresh: (v: boolean) => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  loadError: string;
}

function describeInterval(seconds: number): string {
  if (!seconds) return '';
  if (seconds < 60) return `every ${seconds} seconds`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const minutes = `${m} minute${m === 1 ? '' : 's'}`;
  return s ? `every ${minutes} and ${s} seconds` : `every ${minutes}`;
}

export default function PublicView({
  data,
  scriptUrl,
  addToast,
  reload,
  autoRefresh,
  setAutoRefresh,
  theme,
  setTheme,
  loadError,
}: Props) {
  const { config, sessions } = data;
  // Tracked by key, not by object, so an auto-refresh mid-selection feeds the
  // modal the current ticket list instead of a stale snapshot.
  const [reserveKey, setReserveKey] = useState<string | null>(null);
  const [waitListFor, setWaitListFor] = useState<string | null>(null);
  // Confirmation emails link to /#return, which lands people straight on the
  // give-back form instead of asking them to hunt for the button.
  const [releaseOpen, setReleaseOpen] = useState(
    () => window.location.hash.toLowerCase() === '#return'
  );

  const reserveFor = sessions.find((s) => s.key === reserveKey) || null;

  // Seats picked directly on each session card, keyed by session.
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const maxTickets = config.maxTicketsPerPerson;

  const pickedFor = (key: string) => picked[key] || [];

  const togglePick = (key: string, label: string) =>
    setPicked((prev) => {
      const current = prev[key] || [];
      if (current.includes(label)) return { ...prev, [key]: current.filter((t) => t !== label) };
      if (current.length >= maxTickets) return prev;
      return { ...prev, [key]: [...current, label] };
    });

  // A background refresh can claim a seat someone had picked but not submitted.
  // Drop those quietly rather than letting the request fail at submit time.
  const availabilityKey = sessions.map((s) => `${s.key}:${s.tickets.join(',')}`).join('|');

  // Shrink a session's bubbles if its labels are too long for the card.
  const fitLabels = useFitLabels([availabilityKey, sessions.length]);
  useEffect(() => {
    const lost: string[] = [];
    const next: Record<string, string[]> = {};
    Object.entries(picked).forEach(([key, labels]) => {
      const session = sessions.find((s) => s.key === key);
      const stillOpen = session ? labels.filter((l) => session.tickets.includes(l)) : [];
      labels.filter((l) => !stillOpen.includes(l)).forEach((l) => lost.push(l));
      next[key] = stillOpen;
    });
    if (!lost.length) return;

    setPicked(next);
    // Say so plainly. Dropping a seat silently would let someone confirm fewer
    // tickets than they thought they had chosen.
    addToast(
      'error',
      lost.length === 1
        ? `${lost[0]} was just taken by someone else, so it has been removed from your selection.`
        : `${lost.length} of your selected seats were just taken by someone else and have been removed: ${lost.join(', ')}.`
    );
    // Depends on the availability snapshot, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availabilityKey]);

  const guidelines = (config.guidelines || '')
    .split('\n')
    .map((l) => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);

  const intervalNote = describeInterval(config.refreshIntervalSeconds);
  const totalAvailable = sessions.reduce((sum, s) => sum + s.available, 0);

  return (
    <>
      <header className="app-header">
        <h1 className="app-title">{config.eventName}</h1>
        {config.eventDates && <div className="app-dates">{config.eventDates}</div>}
        {config.eventSubtitle && <div className="app-org">{config.eventSubtitle}</div>}

        <div className="header-controls">
          <button
            className={`chip-btn ${autoRefresh ? 'on' : 'off'}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={
              autoRefresh
                ? 'Auto-refresh is on — the page updates itself as tickets are taken'
                : 'Auto-refresh is off'
            }
          >
            {autoRefresh ? <Play size={12} /> : <Pause size={12} />}
            Auto-refresh {autoRefresh ? 'on' : 'off'}
          </button>
          <button className="chip-btn" onClick={reload}>
            <RefreshCw size={12} /> Refresh now
          </button>
          <button className="chip-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? <Moon size={12} /> : <Sun size={12} />}
            {theme === 'light' ? 'Dark' : 'Light'} mode
          </button>
          {config.howToVideoUrl && (
            <a className="chip-btn accent" href={config.howToVideoUrl} target="_blank" rel="noopener noreferrer">
              <Play size={12} fill="currentColor" /> How-to video
            </a>
          )}
        </div>

        {autoRefresh && intervalNote && (
          <div className="refresh-note">This page checks for taken tickets {intervalNote}.</div>
        )}
        {autoRefresh && !intervalNote && (
          <div className="refresh-note">Auto-refresh is switched off in the spreadsheet.</div>
        )}
      </header>

      {loadError && (
        <div className="closed-banner" style={{ marginBottom: '1.5rem' }}>
          <AlertTriangle size={20} />
          <span>Last refresh failed: {loadError}</span>
        </div>
      )}

      {config.headerNotice && (
        <div className="notice-banner">
          <Info size={20} style={{ flexShrink: 0 }} />
          <span>{config.headerNotice}</span>
        </div>
      )}

      {guidelines.length > 0 && (
        <div className="guidelines-card">
          <h3>
            <Info size={18} /> Guidelines
          </h3>
          <ul>
            {guidelines.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}

      {!config.requestsOpen && (
        <div className="closed-banner">
          <AlertTriangle size={20} />
          <span>{config.closedMessage}</span>
        </div>
      )}

      <div className="action-row">
        {config.waitListEnabled && (
          <button className="big-action-btn secondary" onClick={() => setWaitListFor(ANY_SESSION)}>
            <ListPlus size={18} /> Join the wait list
          </button>
        )}
        {config.releaseEnabled && (
          <button className="big-action-btn" onClick={() => setReleaseOpen(true)}>
            <Undo2 size={18} /> Give tickets back
          </button>
        )}
      </div>

      {config.supportEmail && (
        <div className="support-notice-banner">
          <Info size={22} style={{ flexShrink: 0 }} />
          <span>
            Questions, or trouble signing up? Email{' '}
            <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a>
          </span>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="empty-state">
          <h3>No sessions yet</h3>
          <p style={{ margin: 0 }}>
            Add a session name in row 1 of the <strong>Tickets</strong> tab, its start time in row 2, and the
            ticket labels below that. This page will pick them up on the next refresh.
          </p>
        </div>
      ) : (
        <div className="sessions-grid">
          {sessions.map((session) => {
            const mine = pickedFor(session.key);
            const pct = session.total ? (session.available / session.total) * 100 : 0;
            const isFull = session.available === 0;
            const fillClass = isFull ? 'none' : pct <= 25 ? 'low' : '';

            return (
              <section
                key={session.key}
                id={`session-${session.key}`}
                className={`session-card${isFull ? ' is-full' : ''}`}
              >
                <div className="session-head">
                  <div>
                    <div className="session-name">{session.name}</div>
                    {session.time && (
                      <div className="session-time">
                        <Clock size={14} /> {session.time}
                      </div>
                    )}
                  </div>
                  {isFull ? (
                    <span className="badge badge-full">All claimed</span>
                  ) : (
                    <span className={`badge ${pct <= 25 ? 'badge-limited' : 'badge-available'}`}>
                      {session.available} left
                    </span>
                  )}
                </div>

                <div>
                  <div className="capacity-bar">
                    <div className={`capacity-fill ${fillClass}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="capacity-text" style={{ marginTop: '0.4rem' }}>
                    <span>
                      {session.available} of {session.total} available
                    </span>
                  </div>
                </div>

                {session.tickets.length > 0 && config.requestsOpen && (
                  <div className="pick-summary">
                    <span>
                      {mine.length ? (
                        <>
                          <strong style={{ color: 'var(--text-primary)' }}>{mine.length}</strong> of{' '}
                          {maxTickets} selected
                        </>
                      ) : (
                        'Tap the seats you want'
                      )}
                    </span>
                    {mine.length > 0 && (
                      <button
                        className="chip-btn"
                        style={{ padding: '0.15rem 0.6rem' }}
                        onClick={() => setPicked((prev) => ({ ...prev, [session.key]: [] }))}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}

                <div className="ticket-chips" ref={fitLabels}>
                  {session.tickets.length === 0 ? (
                    <span className="ticket-empty" style={{ gridColumn: '1 / -1' }}>
                      Every ticket has been claimed
                    </span>
                  ) : (
                    session.tickets.map((t) => {
                      const isPicked = mine.includes(t);
                      const blocked = !isPicked && mine.length >= maxTickets;
                      return config.requestsOpen ? (
                        <button
                          key={t}
                          type="button"
                          title={t}
                          aria-pressed={isPicked}
                          className={`ticket-chip${isPicked ? ' picked' : ''}`}
                          disabled={blocked}
                          onClick={() => togglePick(session.key, t)}
                        >
                          {isPicked && <Check size={12} />}
                          {t}
                        </button>
                      ) : (
                        <span key={t} className="ticket-chip" title={t}>
                          {t}
                        </span>
                      );
                    })
                  )}
                </div>

                {session.waitListCount > 0 && (
                  <div className="capacity-text" style={{ justifyContent: 'flex-start', gap: '0.4rem' }}>
                    <Users size={14} style={{ color: 'var(--text-muted)' }} />
                    <span>
                      {session.waitListCount} {session.waitListCount === 1 ? 'person is' : 'people are'} on the
                      wait list
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: 'auto' }}>
                  <button
                    className="btn btn-primary"
                    disabled={!config.requestsOpen || isFull || mine.length === 0}
                    onClick={() => setReserveKey(session.key)}
                  >
                    <Ticket size={16} />
                    {isFull
                      ? 'All tickets claimed'
                      : mine.length === 0
                      ? 'Select seats above'
                      : `Request ${mine.length} ticket${mine.length === 1 ? '' : 's'}`}
                  </button>

                  {config.waitListEnabled && (isFull || config.waitListAlwaysVisible) && (
                    <button className="btn btn-ghost" onClick={() => setWaitListFor(session.name)}>
                      <ListPlus size={16} /> Join the wait list for this session
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <footer
        style={{
          textAlign: 'center',
          marginTop: '3rem',
          color: 'var(--text-muted)',
          fontSize: '0.82rem',
        }}
      >
        {totalAvailable} ticket{totalAvailable === 1 ? '' : 's'} still available across all sessions.
      </footer>

      {reserveFor && (
        <ReserveModal
          session={reserveFor}
          selected={pickedFor(reserveFor.key)}
          maxTickets={maxTickets}
          onRemove={(label) => togglePick(reserveFor.key, label)}
          scriptUrl={scriptUrl}
          supportEmail={config.supportEmail}
          addToast={addToast}
          onClose={() => setReserveKey(null)}
          onSubmitted={() => setPicked((prev) => ({ ...prev, [reserveFor.key]: [] }))}
          onDone={reload}
        />
      )}

      {waitListFor && (
        <WaitListModal
          sessions={sessions}
          initialSession={waitListFor}
          scriptUrl={scriptUrl}
          addToast={addToast}
          onClose={() => setWaitListFor(null)}
          onDone={reload}
        />
      )}

      {releaseOpen && (
        <ReleaseModal
          scriptUrl={scriptUrl}
          supportEmail={config.supportEmail}
          addToast={addToast}
          onClose={() => {
            setReleaseOpen(false);
            // Clear #return so a reload doesn't reopen the form.
            if (window.location.hash.toLowerCase() === '#return') {
              history.replaceState(null, '', window.location.pathname + window.location.search);
            }
          }}
          onDone={reload}
        />
      )}
    </>
  );
}

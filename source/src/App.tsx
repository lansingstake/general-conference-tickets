import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Info,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { ApiError, fetchPublic, getScriptUrl, saveScriptUrl } from './api';
import type { PublicPayload, ToastMessage } from './types';
import PublicView from './components/PublicView';
import AdminView from './components/AdminView';

const AUTO_REFRESH_KEY = 'gc_tickets_auto_refresh';
const THEME_KEY = 'gc_tickets_theme';

function currentRoute(): 'public' | 'admin' {
  return window.location.hash.toLowerCase().startsWith('#admin') ? 'admin' : 'public';
}

export default function App() {
  const [route, setRoute] = useState<'public' | 'admin'>(currentRoute);
  const [scriptUrl, setScriptUrl] = useState<string>(getScriptUrl);
  const [urlDraft, setUrlDraft] = useState<string>('');

  const [data, setData] = useState<PublicPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [autoRefresh, setAutoRefresh] = useState<boolean>(
    () => localStorage.getItem(AUTO_REFRESH_KEY) !== 'off'
  );
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' ? 'light' : 'dark';
  });

  // The sheet decides the cadence; a ref keeps the polling loop from restarting
  // every time a fetch lands with the same value.
  const intervalRef = useRef(30000);

  useEffect(() => {
    document.body.classList.toggle('light-theme', theme === 'light');
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.body.classList.toggle('admin-mode', route === 'admin');
  }, [route]);

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    localStorage.setItem(AUTO_REFRESH_KEY, autoRefresh ? 'on' : 'off');
  }, [autoRefresh]);

  const addToast = useCallback((type: ToastMessage['type'], text: string) => {
    const id = Math.random().toString(36).slice(2, 11);
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), type === 'error' ? 9000 : 6000);
  }, []);

  const load = useCallback(
    async (showSpinner: boolean) => {
      if (!scriptUrl) return;
      if (showSpinner) setLoading(true);
      else setSyncing(true);
      try {
        const payload = await fetchPublic(scriptUrl);
        setData(payload);
        setLoadError('');
        const seconds = payload.config?.refreshIntervalSeconds;
        if (typeof seconds === 'number') intervalRef.current = seconds * 1000;
      } catch (err) {
        const message = err instanceof ApiError ? err.message : String(err);
        setLoadError(message);
        if (showSpinner) addToast('error', message);
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [scriptUrl, addToast]
  );

  // Initial fetch, then a self-scheduling poll so a slow response can never
  // stack up requests behind it.
  useEffect(() => {
    if (!scriptUrl || route === 'admin') return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (!alive) return;
      await load(false);
      schedule();
    };

    const schedule = () => {
      if (!alive || !autoRefresh || intervalRef.current <= 0) return;
      timer = setTimeout(tick, intervalRef.current);
    };

    (async () => {
      await load(true);
      schedule();
    })();

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [scriptUrl, autoRefresh, route, load]);

  const handleSaveUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const url = urlDraft.trim();
    if (!/^https:\/\/script\.google\.com\/.+\/exec/.test(url)) {
      addToast('error', 'That does not look like a deployed Apps Script URL. It should end in /exec.');
      return;
    }
    saveScriptUrl(url);
    setScriptUrl(url);
  };

  /* ------------------------------------------------------------- rendering */

  const toastBar = (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.type === 'success' ? (
            <CheckCircle size={18} />
          ) : t.type === 'error' ? (
            <AlertTriangle size={18} />
          ) : (
            <Info size={18} />
          )}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );

  if (!scriptUrl) {
    return (
      <>
        {toastBar}
        <div className="config-screen">
          <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--primary)' }}>
            <Settings size={44} />
          </div>
          <h2>Connect to your spreadsheet</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: 0 }}>
            Paste the Google Apps Script web app URL you got from <em>Deploy &rsaquo; New deployment</em>. It ends
            in <code>/exec</code>.
          </p>
          <form onSubmit={handleSaveUrl} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input
              type="url"
              className="input-text"
              placeholder="https://script.google.com/macros/s/.../exec"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary">
              Connect
            </button>
          </form>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
            Set <code>VITE_APPS_SCRIPT_URL</code> in <code>.env.local</code> to skip this screen for everyone.
          </p>
        </div>
      </>
    );
  }

  if (route === 'admin') {
    return (
      <>
        {toastBar}
        <AdminView scriptUrl={scriptUrl} addToast={addToast} theme={theme} setTheme={setTheme} />
      </>
    );
  }

  if (loading && !data) {
    return (
      <>
        {toastBar}
        <div className="loading-screen">
          <div className="spinner" />
          <div className="loading-text">Loading tickets…</div>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        {toastBar}
        <div className="config-screen">
          <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--danger)' }}>
            <AlertTriangle size={44} />
          </div>
          <h2>Could not load tickets</h2>
          <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line', margin: 0 }}>{loadError}</p>
          <button className="btn btn-primary" onClick={() => load(true)}>
            Try again
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {toastBar}
      {syncing && (
        <div className="sync-pill">
          <RefreshCw size={14} className="spin-icon" /> Checking for updates…
        </div>
      )}
      <PublicView
        data={data}
        scriptUrl={scriptUrl}
        addToast={addToast}
        reload={() => load(false)}
        autoRefresh={autoRefresh}
        setAutoRefresh={setAutoRefresh}
        theme={theme}
        setTheme={setTheme}
        loadError={loadError}
      />
    </>
  );
}

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ── Icons (inline SVG, matching the reference design) ────────────────────
const FolderIcon = () => (
  <svg className="row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);
const VideoIcon = () => (
  <svg className="row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m10.5 9.5 4 2.5-4 2.5z" />
  </svg>
);
const AudioIcon = () => (
  <svg className="row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
    <path d="M9 18V6l12-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
);
const FileIcon = () => (
  <svg className="row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </svg>
);
const SubtitleIcon = () => (
  <svg className="row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="2" /><path d="M7 12h4m-4 4h10M15 12h2" />
  </svg>
);
const PlayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);
const DownloadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
  </svg>
);
const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
  </svg>
);
const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
  </svg>
);
const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

// ── Types ─────────────────────────────────────────────────────────────────
interface Library { id: string; name: string; }
interface Item {
  name: string; path: string;
  kind: 'folder' | 'video' | 'audio' | 'subtitle' | 'file';
  size?: number; ext?: string;
}

function formatBytes(n?: number) {
  if (!n) return '0 B';
  const k = 1024, s = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${parseFloat((n / Math.pow(k, i)).toFixed(1))} ${s[i]}`;
}
const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

function RowIcon({ kind }: { kind: Item['kind'] }) {
  if (kind === 'folder') return <FolderIcon />;
  if (kind === 'video') return <VideoIcon />;
  if (kind === 'audio') return <AudioIcon />;
  if (kind === 'subtitle') return <SubtitleIcon />;
  return <FileIcon />;
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function Home() {
  const [theme, setTheme] = useState<'dark' | 'light' | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [libraries, setLibraries] = useState<Library[]>([]);
  const [currentLib, setCurrentLib] = useState<Library | null>(null);
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [playingItem, setPlayingItem] = useState<Item | null>(null);

  // dialog refs (native <dialog>)
  const playerRef = useRef<HTMLDialogElement>(null);
  const loginRef = useRef<HTMLDialogElement>(null);
  const adminRef = useRef<HTMLDialogElement>(null);

  // login form
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // admin register form
  const [regName, setRegName] = useState('');
  const [regPath, setRegPath] = useState('');
  const [regMsg, setRegMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [regLoading, setRegLoading] = useState(false);
  const [adminLibraries, setAdminLibraries] = useState<(Library & { path: string })[]>([]);

  // ── Theme ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem('theme') as 'dark' | 'light' | null;
    setTheme(stored || null);
    if (stored) document.documentElement.setAttribute('data-theme', stored);
  }, []);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }

  // ── Auth ──────────────────────────────────────────────────────────────
  function getAuthHeaders(): HeadersInit {
    const t = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null;
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/auth/me', { headers: getAuthHeaders() });
        setIsAdmin(r.ok);
      } catch { setIsAdmin(false); }
    })();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginErr('');
    setLoginLoading(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser.trim(), password: loginPass }),
      });
      const d = await r.json();
      if (!r.ok) { setLoginErr(d.error || 'Login failed'); return; }
      if (d.token) localStorage.setItem('admin_token', d.token);
      setIsAdmin(true);
      loginRef.current?.close();
      setLoginUser(''); setLoginPass('');
    } catch { setLoginErr('Network error'); }
    finally { setLoginLoading(false); }
  }

  async function handleLogout() {
    try { await fetch('/api/auth/logout', { method: 'POST', headers: getAuthHeaders() }); } catch {}
    localStorage.removeItem('admin_token');
    setIsAdmin(false);
  }

  // ── Libraries ─────────────────────────────────────────────────────────
  const loadLibraries = useCallback(async (keepCurrent = false) => {
    try {
      const r = await fetch('/api/libraries');
      const d = await r.json();
      const libs: Library[] = d.items || [];
      setLibraries(libs);
      if (libs.length === 0) { setCurrentLib(null); setItems([]); setLoading(false); return; }
      const next = keepCurrent && currentLib && libs.some(l => l.id === currentLib.id)
        ? currentLib : libs[0];
      setCurrentLib(next);
      loadDirectory(next.id, '');
    } catch { setError('Cannot connect to server'); setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadLibraries(); }, [loadLibraries]);

  async function loadDirectory(libId: string, subpath: string) {
    setCurrentPath(subpath);
    setQ('');
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/list?lib=${libId}&path=${encodeURIComponent(subpath)}`);
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Failed to list directory'); setItems([]); }
      else setItems(d.items || []);
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  }

  // ── Admin panel ───────────────────────────────────────────────────────
  async function loadAdminLibraries() {
    const r = await fetch('/api/admin/libraries', { headers: getAuthHeaders() });
    if (r.ok) { const d = await r.json(); setAdminLibraries(d.items || []); }
  }

  function openAdminPanel() {
    setRegMsg(null); setRegName(''); setRegPath('');
    loadAdminLibraries();
    adminRef.current?.showModal();
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegMsg(null); setRegLoading(true);
    try {
      const r = await fetch('/api/admin/libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: regName.trim(), path: regPath.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setRegMsg({ ok: false, text: d.error || 'Failed' }); return; }
      setRegMsg({ ok: true, text: `"${d.library.name}" registered.` });
      setRegName(''); setRegPath('');
      loadAdminLibraries();
      loadLibraries(true);
    } catch { setRegMsg({ ok: false, text: 'Network error' }); }
    finally { setRegLoading(false); }
  }

  async function handleRemove(id: string, name: string) {
    if (!confirm(`Unregister "${name}"? Files on disk won't be deleted.`)) return;
    const r = await fetch(`/api/admin/libraries/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    if (r.ok) { loadAdminLibraries(); loadLibraries(true); }
  }

  // ── Player ────────────────────────────────────────────────────────────
  function openPlayer(item: Item) {
    setPlayingItem(item);
    playerRef.current?.showModal();
  }
  function closePlayer() {
    playerRef.current?.close();
    setPlayingItem(null);
  }

  const subtitles = items.filter(i => i.kind === 'subtitle');
  const matchedSub = playingItem
    ? subtitles.find(s =>
        s.name.toLowerCase().startsWith(playingItem.name.replace(/\.[^/.]+$/, '').toLowerCase()) ||
        s.name.toLowerCase().includes('.en.') || s.name.toLowerCase().includes('english')
      ) || subtitles[0]
    : null;

  // ── Filtered list ─────────────────────────────────────────────────────
  const filtered = items.filter(i => i.name.toLowerCase().includes(q.toLowerCase()));

  // ── Breadcrumb segments ───────────────────────────────────────────────
  const pathSegs = currentPath ? currentPath.split('/').filter(Boolean) : [];

  return (
    <div className="wrap">
      {/* ── Header ── */}
      <header className="site-header">
        <h1 className="site-title">Home Media & Files</h1>
        <div className="header-actions">
          {isAdmin && <span className="admin-badge">Admin</span>}
          {isAdmin ? (
            <>
              <button className="text-btn" onClick={openAdminPanel}>Register path</button>
              <button className="text-btn" onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <button className="text-btn" onClick={() => loginRef.current?.showModal()}>Admin login</button>
          )}
          <button className="text-btn icon-btn" onClick={toggleTheme} aria-label="Toggle theme" style={{ width: 32, height: 32 }}>
            {theme === 'light' ? <MoonIcon /> : <SunIcon />}
          </button>
        </div>
      </header>

      {/* ── Library tabs ── */}
      <nav className="libs" role="tablist" aria-label="Libraries">
        {libraries.map(lib => (
          <button
            key={lib.id}
            role="tab"
            className="lib-tab"
            aria-selected={currentLib?.id === lib.id}
            onClick={() => { setCurrentLib(lib); loadDirectory(lib.id, ''); }}
          >
            {lib.name}
          </button>
        ))}
        {libraries.length === 0 && !loading && (
          <span style={{ fontSize: 14, color: 'var(--muted)', paddingBottom: 12 }}>
            No libraries registered
          </span>
        )}
      </nav>

      {/* ── Toolbar: breadcrumbs + search ── */}
      <div className="bar">
        <div className="crumbs">
          {currentLib && (
            <>
              <button onClick={() => loadDirectory(currentLib.id, '')}>{currentLib.name}</button>
              {pathSegs.map((seg, idx) => {
                const acc = pathSegs.slice(0, idx + 1).join('/');
                const isLast = idx === pathSegs.length - 1;
                return (
                  <React.Fragment key={acc}>
                    <span className="sep">/</span>
                    {isLast
                      ? <span className="cur">{seg}</span>
                      : <button onClick={() => loadDirectory(currentLib.id, acc)}>{seg}</button>
                    }
                  </React.Fragment>
                );
              })}
            </>
          )}
        </div>
        <label className="search-wrap">
          <SearchIcon />
          <input
            className="search-input"
            type="search"
            placeholder="Filter this folder"
            aria-label="Filter this folder"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </label>
      </div>

      {/* ── File list ── */}
      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          Loading...
        </div>
      )}
      {error && <div className="empty-state" style={{ color: 'var(--danger)' }}>{error}</div>}
      {!loading && !error && (
        <ul className="file-list">
          {filtered.length === 0 && (
            <li className="empty-state">
              {q ? `Nothing matches "${q}".` : libraries.length === 0
                ? isAdmin ? 'Register a directory path above.' : 'No libraries available yet.'
                : 'This folder is empty.'}
            </li>
          )}
          {filtered.map(item => {
            const isFolder = item.kind === 'folder';
            const isMedia = item.kind === 'video' || item.kind === 'audio';
            const downloadUrl = `/api/download/${currentLib?.id}/${encodePath(item.path)}`;
            const streamUrl = `/api/stream/${currentLib?.id}/${encodePath(item.path)}`;

            return (
              <li key={item.path} className={`file-row${isFolder ? ' is-folder' : ''}`}>
                <button
                  className="row-main"
                  onClick={() => {
                    if (isFolder) loadDirectory(currentLib!.id, item.path);
                    else if (isMedia) openPlayer(item);
                  }}
                >
                  <RowIcon kind={item.kind} />
                  <span className="row-name">{item.name}</span>
                </button>

                {!isFolder && (
                  <>
                    <span className={`row-size${item.size === 0 ? ' is-zero' : ''}`}>
                      {formatBytes(item.size)}
                    </span>
                    <div className="row-actions">
                      {isMedia && (
                        <button
                          className="icon-btn is-play"
                          aria-label={`Watch ${item.name}`}
                          onClick={() => openPlayer(item)}
                        >
                          <PlayIcon />
                        </button>
                      )}
                      <a
                        href={downloadUrl}
                        download
                        className="icon-btn"
                        aria-label={`Download ${item.name}`}
                      >
                        <DownloadIcon />
                      </a>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Video Player dialog ── */}
      <dialog ref={playerRef} onClick={e => { if (e.target === playerRef.current) closePlayer(); }}>
        <div className="player-dialog">
          <div className="player-top">
            <span className="player-title">{playingItem?.name}</span>
            <div className="player-top-actions">
              {playingItem && currentLib && (
                <a
                  href={`/api/download/${currentLib.id}/${encodePath(playingItem.path)}`}
                  download
                  className="icon-btn"
                  aria-label="Download"
                >
                  <DownloadIcon />
                </a>
              )}
              <button className="icon-btn" onClick={closePlayer} aria-label="Close">
                <CloseIcon />
              </button>
            </div>
          </div>
          <div className="player-stage">
            {playingItem && currentLib && (
              <video
                key={playingItem.path}
                controls
                playsInline
                autoPlay
                preload="metadata"
                crossOrigin="anonymous"
              >
                <source src={`/api/stream/${currentLib.id}/${encodePath(playingItem.path)}`} />
                {matchedSub && (
                  <track
                    kind="subtitles"
                    label={matchedSub.name}
                    src={`/api/subtitle/${currentLib.id}/${encodePath(matchedSub.path)}`}
                    srcLang="en"
                    default
                  />
                )}
              </video>
            )}
          </div>
        </div>
      </dialog>

      {/* ── Admin Login dialog ── */}
      <dialog ref={loginRef} onClick={e => { if (e.target === loginRef.current) loginRef.current?.close(); }}>
        <div className="login-dialog">
          <div className="dialog-top">
            <span>Admin login</span>
            <button className="icon-btn" onClick={() => loginRef.current?.close()} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
          <div className="dialog-body">
            <form onSubmit={handleLogin}>
              <div className="field">
                <label htmlFor="login-user">Username</label>
                <input id="login-user" type="text" value={loginUser} onChange={e => setLoginUser(e.target.value)} required autoFocus />
              </div>
              <div className="field">
                <label htmlFor="login-pass">Password</label>
                <input id="login-pass" type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} required />
              </div>
              {loginErr && <div className="msg err">{loginErr}</div>}
              <button type="submit" className="btn-solid full" disabled={loginLoading}>
                {loginLoading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      </dialog>

      {/* ── Admin Register dialog ── */}
      <dialog ref={adminRef} onClick={e => { if (e.target === adminRef.current) adminRef.current?.close(); }}>
        <div className="admin-dialog">
          <div className="dialog-top">
            <span>Register directory path</span>
            <button className="icon-btn" onClick={() => adminRef.current?.close()} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
          <div className="dialog-body">
            <form onSubmit={handleRegister}>
              <div className="field">
                <label htmlFor="reg-name">Display name</label>
                <input id="reg-name" type="text" value={regName} onChange={e => setRegName(e.target.value)} placeholder="e.g. Movies, Downloads, Books" required />
              </div>
              <div className="field">
                <label htmlFor="reg-path">Directory path on this PC</label>
                <input id="reg-path" type="text" value={regPath} onChange={e => setRegPath(e.target.value)} placeholder="e.g. C:/Movies or D:/Downloads" required />
              </div>
              {regMsg && <div className={`msg ${regMsg.ok ? 'ok' : 'err'}`}>{regMsg.text}</div>}
              <button type="submit" className="btn-solid full" disabled={regLoading}>
                {regLoading ? 'Registering…' : 'Register directory'}
              </button>
            </form>

            {adminLibraries.length > 0 && (
              <>
                <p className="section-title">Registered directories</p>
                <ul className="reg-list">
                  {adminLibraries.map(lib => (
                    <li key={lib.id} className="reg-row">
                      <div className="reg-info">
                        <div className="reg-name">{lib.name}</div>
                        <div className="reg-path">{lib.path}</div>
                      </div>
                      <button
                        className="reg-remove"
                        onClick={() => handleRemove(lib.id, lib.name)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </dialog>
    </div>
  );
}

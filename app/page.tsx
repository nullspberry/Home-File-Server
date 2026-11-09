'use client';

import React, { useState, useEffect } from 'react';
import {
  Folder,
  Film,
  Music,
  FileText,
  FileArchive,
  FileCode,
  Download,
  Play,
  Search,
  MessageSquare,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { LoginModal } from '@/components/LoginModal';
import { AdminRegisterModal } from '@/components/AdminRegisterModal';
import { VideoPlayerModal } from '@/components/VideoPlayerModal';

interface Library {
  id: string;
  name: string;
}

interface Item {
  name: string;
  path: string;
  kind: 'folder' | 'video' | 'audio' | 'subtitle' | 'file';
  size?: number;
  ext?: string;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getItemIcon(kind: string, ext?: string) {
  if (kind === 'folder') return <Folder className="w-5 h-5 text-sky-400" />;
  if (kind === 'video') return <Film className="w-5 h-5 text-emerald-400" />;
  if (kind === 'audio') return <Music className="w-5 h-5 text-purple-400" />;
  if (kind === 'subtitle') return <MessageSquare className="w-5 h-5 text-amber-400" />;
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext || ''))
    return <FileArchive className="w-5 h-5 text-amber-500" />;
  if (['.js', '.ts', '.html', '.css', '.json', '.py'].includes(ext || ''))
    return <FileCode className="w-5 h-5 text-blue-400" />;
  return <FileText className="w-5 h-5 text-slate-400" />;
}

export default function Home() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  const [libraries, setLibraries] = useState<Library[]>([]);
  const [currentLibrary, setCurrentLibrary] = useState<Library | null>(null);
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Video player modal state
  const [playingItem, setPlayingItem] = useState<Item | null>(null);

  useEffect(() => {
    checkAdmin();
    loadLibraries();
  }, []);

  function getAuthHeaders(): HeadersInit {
    const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function checkAdmin() {
    try {
      const res = await fetch('/api/auth/me', { headers: getAuthHeaders() });
      setIsAdmin(res.ok);
    } catch {
      setIsAdmin(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: getAuthHeaders() });
    } catch {}
    if (typeof window !== 'undefined') {
      localStorage.removeItem('admin_token');
    }
    setIsAdmin(false);
  }

  async function loadLibraries(selectedId?: string) {
    try {
      const res = await fetch('/api/libraries');
      const data = await res.json();
      const libs: Library[] = data.items || [];
      setLibraries(libs);

      if (libs.length > 0) {
        const next = selectedId
          ? libs.find((l) => l.id === selectedId) || libs[0]
          : currentLibrary && libs.some((l) => l.id === currentLibrary.id)
          ? currentLibrary
          : libs[0];
        setCurrentLibrary(next);
        loadDirectory(next.id, '');
      } else {
        setCurrentLibrary(null);
        setItems([]);
        setLoading(false);
      }
    } catch {
      setError('Failed to connect to backend server');
      setLoading(false);
    }
  }

  async function loadDirectory(libId: string, subpath: string) {
    setCurrentPath(subpath);
    setLoading(true);
    setError(null);
    setSearch('');

    try {
      const url = `/api/list?lib=${libId}&path=${encodeURIComponent(subpath)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to list directory');
      } else {
        setItems(data.items || []);
      }
    } catch {
      setError('Network error loading directory');
    } finally {
      setLoading(false);
    }
  }

  const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  );

  const subtitles = items.filter((i) => i.kind === 'subtitle');

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar
        isAdmin={isAdmin}
        onOpenLogin={() => setIsLoginOpen(true)}
        onOpenAdmin={() => setIsAdminModalOpen(true)}
        onLogout={handleLogout}
      />

      <main className="container flex-1">
        {/* Libraries Navigation */}
        <section className="libraries-nav">
          <span className="nav-label">Libraries:</span>
          <div className="pill-container">
            {libraries.map((lib) => (
              <button
                key={lib.id}
                className={`lib-pill ${currentLibrary?.id === lib.id ? 'active' : ''}`}
                onClick={() => {
                  setCurrentLibrary(lib);
                  loadDirectory(lib.id, '');
                }}
              >
                {lib.name}
              </button>
            ))}
          </div>
        </section>

        {/* Breadcrumbs */}
        {currentLibrary && (
          <nav className="breadcrumbs">
            <span
              className={`crumb ${!currentPath ? 'active' : ''}`}
              onClick={() => {
                if (currentPath) loadDirectory(currentLibrary.id, '');
              }}
            >
              {currentLibrary.name}
            </span>

            {currentPath &&
              currentPath
                .split('/')
                .filter(Boolean)
                .map((seg, idx, arr) => {
                  const accumulated = arr.slice(0, idx + 1).join('/');
                  const isLast = idx === arr.length - 1;
                  return (
                    <React.Fragment key={accumulated}>
                      <span className="crumb-separator">/</span>
                      <span
                        className={`crumb ${isLast ? 'active' : ''}`}
                        onClick={() => {
                          if (!isLast) loadDirectory(currentLibrary.id, accumulated);
                        }}
                      >
                        {seg}
                      </span>
                    </React.Fragment>
                  );
                })}
          </nav>
        )}

        {/* Search Bar */}
        {items.length > 5 && (
          <div className="filter-bar relative">
            <input
              type="text"
              className="filter-input pl-9"
              placeholder="Filter items in this folder..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          </div>
        )}

        {/* Content Explorer */}
        <section className="card">
          {loading && <div className="loading-state">Loading directory contents...</div>}

          {error && <div className="error-state">{error}</div>}

          {!loading && !error && filteredItems.length === 0 && (
            <div className="empty-state">
              {libraries.length === 0 ? (
                <>
                  <p className="text-lg font-medium text-slate-300">No directories registered yet.</p>
                  <p className="subtext mt-1">
                    {isAdmin
                      ? 'Click "Register Path" above to register your first movie or file folder.'
                      : 'Admin can sign in above to register directories from this PC.'}
                  </p>
                </>
              ) : (
                <p>This folder is empty.</p>
              )}
            </div>
          )}

          {!loading && !error && filteredItems.length > 0 && (
            <div className="items-grid">
              {filteredItems.map((item) => {
                const isFolder = item.kind === 'folder';
                const isVideo = item.kind === 'video';
                const isAudio = item.kind === 'audio';

                const downloadUrl = `/api/download/${currentLibrary?.id}/${encodePath(item.path)}`;
                const streamUrl = `/api/stream/${currentLibrary?.id}/${encodePath(item.path)}`;

                return (
                  <div key={item.path} className="item-row">
                    <div className="item-main">
                      <span className="item-icon">{getItemIcon(item.kind, item.ext)}</span>
                      <div className="item-details">
                        {isFolder ? (
                          <span
                            className="item-name folder-link font-medium"
                            onClick={() => loadDirectory(currentLibrary!.id, item.path)}
                          >
                            {item.name}
                          </span>
                        ) : (
                          <span className="item-name font-medium">{item.name}</span>
                        )}
                        <span className="item-meta">
                          {isFolder ? 'Folder' : formatBytes(item.size)}
                        </span>
                      </div>
                    </div>

                    <div className="item-actions">
                      {(isVideo || isAudio) && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => setPlayingItem(item)}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          {isVideo ? 'Watch' : 'Listen'}
                        </button>
                      )}

                      {!isFolder && (
                        <a href={downloadUrl} download className="btn btn-outline btn-sm">
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Modals */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onSuccess={() => {
          setIsAdmin(true);
          loadLibraries();
        }}
      />

      <AdminRegisterModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        onLibraryChanged={() => loadLibraries()}
      />

      {playingItem && currentLibrary && (
        <VideoPlayerModal
          isOpen={Boolean(playingItem)}
          onClose={() => setPlayingItem(null)}
          title={playingItem.name}
          streamUrl={`/api/stream/${currentLibrary.id}/${encodePath(playingItem.path)}`}
          downloadUrl={`/api/download/${currentLibrary.id}/${encodePath(playingItem.path)}`}
          subtitles={subtitles}
          libraryId={currentLibrary.id}
        />
      )}
    </div>
  );
}


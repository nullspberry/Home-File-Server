'use client';

import React, { useState, useEffect } from 'react';
import { X, FolderPlus, Trash2, HardDrive, CheckCircle2 } from 'lucide-react';

interface Library {
  id: string;
  name: string;
  path: string;
}

interface AdminRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLibraryChanged: () => void;
}

export function AdminRegisterModal({ isOpen, onClose, onLibraryChanged }: AdminRegisterModalProps) {
  const [name, setName] = useState('');
  const [dirPath, setDirPath] = useState('');
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadAdminLibraries();
      setMsg(null);
    }
  }, [isOpen]);

  function getAuthHeaders(): HeadersInit {
    const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function loadAdminLibraries() {
    try {
      const res = await fetch('/api/admin/libraries', {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setLibraries(data.items || []);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const res = await fetch('/api/admin/libraries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ name: name.trim(), path: dirPath.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: 'error', text: data.error || 'Failed to register path' });
        setLoading(false);
        return;
      }

      setMsg({ type: 'success', text: `Registered "${data.library.name}" successfully!` });
      setName('');
      setDirPath('');
      loadAdminLibraries();
      onLibraryChanged();
    } catch {
      setMsg({ type: 'error', text: 'Network error connecting to backend' });
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(id: string, libName: string) {
    if (!confirm(`Unregister "${libName}"? (Files on disk will NOT be deleted)`)) return;

    try {
      const res = await fetch(`/api/admin/libraries/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        loadAdminLibraries();
        onLibraryChanged();
      }
    } catch (err) {
      console.error(err);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="modal">
      <div className="modal-overlay" onClick={onClose} />
      <div className="admin-dialog card">
        <div className="dialog-header">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2 text-sky-400">
              <FolderPlus className="w-5 h-5" />
              Register Directory Path
            </h3>
            <p className="subtext mt-1">Register any folder on your PC for guests to browse and stream</p>
          </div>
          <button className="btn-close" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleRegister}>
          <div className="form-group">
            <label htmlFor="lib-name">Display Name</label>
            <input
              id="lib-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Movies, Downloads, Anime, Documentaries"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="lib-path">Directory Path on PC</label>
            <input
              id="lib-path"
              type="text"
              value={dirPath}
              onChange={(e) => setDirPath(e.target.value)}
              placeholder="e.g. C:/Movies or D:/Downloads or movies"
              required
            />
          </div>

          {msg && <div className={`form-msg ${msg.type}`}>{msg.text}</div>}

          <button type="submit" className="btn btn-primary full-width mt-2" disabled={loading}>
            {loading ? 'Validating & Registering...' : 'Register Directory'}
          </button>
        </form>

        <div className="registered-list">
          <h3 className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-slate-400" />
            Currently Registered Directories ({libraries.length})
          </h3>
          {libraries.length === 0 ? (
            <p className="text-sm text-slate-400 italic py-2">No directories registered yet.</p>
          ) : (
            <ul className="lib-list">
              {libraries.map((lib) => (
                <li key={lib.id} className="lib-list-item">
                  <div className="lib-info">
                    <span className="lib-title">{lib.name}</span>
                    <span className="lib-disk">{lib.path}</span>
                  </div>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleRemove(lib.id, lib.name)}
                    title="Unregister path"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}


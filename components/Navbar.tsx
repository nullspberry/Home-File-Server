'use client';

import React from 'react';
import { Shield, FolderPlus, LogIn, LogOut, Film } from 'lucide-react';

interface NavbarProps {
  isAdmin: boolean;
  onOpenLogin: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}

export function Navbar({ isAdmin, onOpenLogin, onOpenAdmin, onLogout }: NavbarProps) {
  return (
    <header className="app-header">
      <div className="header-brand">
        <Film className="w-6 h-6 text-sky-400" />
        <h1>Home Media & Files</h1>
      </div>
      <div className="header-actions">
        {isAdmin ? (
          <>
            <span className="badge admin-badge">
              <Shield className="w-3 h-3 inline mr-1" />
              Admin
            </span>
            <button className="btn btn-primary btn-sm" onClick={onOpenAdmin}>
              <FolderPlus className="w-4 h-4" />
              Register Path
            </button>
            <button className="btn btn-outline btn-sm" onClick={onLogout}>
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </>
        ) : (
          <button className="btn btn-outline btn-sm" onClick={onOpenLogin}>
            <LogIn className="w-4 h-4" />
            Admin Login
          </button>
        )}
      </div>
    </header>
  );
}


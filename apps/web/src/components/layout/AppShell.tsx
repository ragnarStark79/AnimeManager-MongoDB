import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import './AppShell.css';

const pageTitles: Record<string, string> = {
  '/':            'Dashboard',
  '/bookmarks':   'Bookmarks',
  '/my-list':     'My List',
  '/collections': 'Collections',
  '/titles':      'Titles',
  '/import':      'Import',
  '/settings':    'Settings',
};

export function AppShell() {
  const location = useLocation();
  const pageTitle = pageTitles[location.pathname] ?? (location.pathname.startsWith('/titles/') ? 'Title Detail' : 'AnimeManager');

  return (
    <div className="app-shell">
      {/* Accessible skip link for keyboard navigation */}
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      {/* Decorative ambient light orbs */}
      <div className="ambience-orbs" aria-hidden="true">
        <div className="ambience-orb ambience-orb-1" />
        <div className="ambience-orb ambience-orb-2" />
        <div className="ambience-orb ambience-orb-3" />
      </div>

      {/* Sidebar */}
      <Sidebar />

      {/* Main area */}
      <div className="app-main">
        <Header title={pageTitle} />

        <main
          id="main-content"
          className="app-content"
          role="main"
          aria-label={pageTitle}
        >
          <div className="app-content-inner animate-fade-up">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <MobileNav />
    </div>
  );
}

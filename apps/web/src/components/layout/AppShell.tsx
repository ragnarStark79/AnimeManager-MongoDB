import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth-context';
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
  const { isAuthenticated, isLoading } = useAuth();
  const pageTitle = pageTitles[location.pathname] ?? (location.pathname.startsWith('/titles/') ? 'Title Detail' : 'AnimeManager');

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0f',
        }}
        aria-label="Checking active session..."
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '3px solid rgba(255, 255, 255, 0.1)',
            borderTopColor: '#6366f1',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }


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

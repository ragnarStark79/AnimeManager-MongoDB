import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  Bookmark,
  Library,
  FolderKanban,
  Settings,
  ChevronRight,
} from 'lucide-react';
import './Sidebar.css';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
}

const navItems: NavItem[] = [
  { to: '/',            icon: <LayoutDashboard size={18} />, label: 'Dashboard', end: true },
  { to: '/bookmarks',   icon: <Bookmark size={18} />,        label: 'Bookmarks' },
  { to: '/my-list',     icon: <Library size={18} />,         label: 'My List' },
  { to: '/collections', icon: <FolderKanban size={18} />,    label: 'Collections' },
  { to: '/titles',      icon: <BookOpen size={18} />,        label: 'Titles' },
];

const bottomItems: NavItem[] = [
  { to: '/settings',  icon: <Settings size={18} />,        label: 'Settings' },
];

export function Sidebar() {
  const location = useLocation();
  void location;

  return (
    <aside className="sidebar glass-sidebar" aria-label="Primary navigation">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark" aria-hidden="true">
          <span>A</span>
        </div>
        <span className="sidebar-logo-text">AnimeManager</span>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav" aria-label="Main menu">
        <ul className="sidebar-nav-list" role="list">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  ['sidebar-nav-item', isActive ? 'sidebar-nav-item--active' : ''].join(' ').trim()
                }
              >
                <span className="sidebar-nav-icon" aria-hidden="true">{item.icon}</span>
                <span className="sidebar-nav-label">{item.label}</span>
                <ChevronRight size={14} className="sidebar-nav-arrow" aria-hidden="true" />
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className="sidebar-bottom">
        <div className="sidebar-divider" aria-hidden="true" />
        <ul className="sidebar-nav-list" role="list">
          {bottomItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  ['sidebar-nav-item', isActive ? 'sidebar-nav-item--active' : ''].join(' ').trim()
                }
              >
                <span className="sidebar-nav-icon" aria-hidden="true">{item.icon}</span>
                <span className="sidebar-nav-label">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

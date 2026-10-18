import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Bookmark,
  Library,
  FolderKanban,
  BookOpen,
} from 'lucide-react';
import './MobileNav.css';

const navItems = [
  { to: '/',            icon: <LayoutDashboard size={20} />, label: 'Home',        end: true },
  { to: '/bookmarks',   icon: <Bookmark size={20} />,        label: 'Bookmarks' },
  { to: '/my-list',     icon: <Library size={20} />,         label: 'My List' },
  { to: '/collections', icon: <FolderKanban size={20} />,    label: 'Collections' },
  { to: '/titles',      icon: <BookOpen size={20} />,        label: 'Titles' },
];

export function MobileNav() {
  return (
    <nav className="mobile-nav glass-header" aria-label="Mobile navigation">
      <ul className="mobile-nav-list" role="list">
        {navItems.map((item) => (
          <li key={item.to} className="mobile-nav-item">
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                ['mobile-nav-link', isActive ? 'mobile-nav-link--active' : ''].join(' ').trim()
              }
            >
              <span className="mobile-nav-icon" aria-hidden="true">{item.icon}</span>
              <span className="mobile-nav-label">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

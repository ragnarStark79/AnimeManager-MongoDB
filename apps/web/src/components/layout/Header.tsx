import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Search, Bell, Plus, User } from 'lucide-react';
import { AddTitleModal } from '../ui';
import './Header.css';

interface HeaderProps {
  title?: string;
}

const HEADER_NAV_LINKS = [
  { to: '/',            label: 'Dashboard',   end: true },
  { to: '/bookmarks',   label: 'Bookmarks' },
  { to: '/my-list',     label: 'My List' },
  { to: '/collections', label: 'Collections' },
  { to: '/titles',      label: 'Titles' },
];

export function Header({ title }: HeaderProps) {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchValue.trim();
    if (trimmed) {
      navigate(`/titles?q=${encodeURIComponent(trimmed)}`);
    } else {
      navigate('/titles');
    }
  };

  return (
    <header className="header glass-header" role="banner">
      <div className="header-inner">
        {/* Page title */}
        {title && (
          <h1 className="header-title">{title}</h1>
        )}

        {/* Center pill navigation inspired by reference */}
        <nav className="header-nav-pill" aria-label="Primary routes">
          {HEADER_NAV_LINKS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                ['header-nav-pill-item', isActive ? 'header-nav-pill-item--active' : ''].filter(Boolean).join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Search bar */}
        <div className={['header-search', searchOpen ? 'header-search--open' : ''].join(' ').trim()}>
          <form className="header-search-inner" onSubmit={handleSearchSubmit} role="search">
            <Search size={16} className="header-search-icon" aria-hidden="true" />
            <input
              id="global-search"
              type="search"
              className="header-search-input"
              placeholder="Search sample catalog (press Enter)…"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              aria-label="Search sample catalog"
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setSearchOpen(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.currentTarget.blur();
                }
              }}
            />
          </form>
        </div>

        {/* Right actions */}
        <div className="header-actions">
          <button
            type="button"
            className="header-btn header-btn--primary"
            aria-label="Add a new title"
            onClick={() => setAddOpen(true)}
          >
            <Plus size={16} aria-hidden="true" />
            <span className="header-btn-label">Add</span>
          </button>

          <button
            className="header-icon-btn"
            aria-label="Notifications (coming in Phase 05)"
            title="Notifications (coming in Phase 05)"
            type="button"
            disabled
          >
            <Bell size={18} aria-hidden="true" />
          </button>

          <NavLink
            to="/settings"
            className="header-avatar"
            aria-label="Settings & Preferences"
            title="Settings & Preferences"
          >
            <User size={16} aria-hidden="true" />
          </NavLink>
        </div>
      </div>

      {/* Add Title modal preview */}
      <AddTitleModal open={addOpen} onClose={() => setAddOpen(false)} />
    </header>
  );
}

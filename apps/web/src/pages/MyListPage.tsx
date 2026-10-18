import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Library, FolderKanban, ArrowRight, Info, Layers } from 'lucide-react';
import { EmptyState, LoadingState, GlassCard, Button } from '../components/ui';
import { api, type CollectionSummary } from '../lib/api-client';
import './Placeholder.css';

export function MyListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['collections'],
    queryFn: () => api.collections.list(),
  });

  const collections: CollectionSummary[] = data?.data || [];

  return (
    <div className="placeholder-page">
      <div className="placeholder-page-header">
        <div>
          <p className="placeholder-eyebrow">
            <Library size={13} aria-hidden="true" /> My List
          </p>
          <h1 className="placeholder-title">My List</h1>
          <p className="placeholder-sub">
            Your personal organization area. Group anime, manga, and manhwa into
            custom collections and themed folders. A single title can belong to
            multiple collections simultaneously.
          </p>
        </div>
        <Link to="/collections" className="btn btn--primary btn--md">
          <FolderKanban size={15} aria-hidden="true" />
          Manage Collections
        </Link>
      </div>

      {/* Distinction notice */}
      <div className="mylist-notice" role="note">
        <Info size={14} aria-hidden="true" />
        <span>
          <strong>My List vs. Bookmarks:</strong> My List is your organizational
          system — folders and groupings. Bookmarks track your watch/read status
          and progress. They are independent and serve different purposes.
        </span>
      </div>

      {isLoading ? (
        <LoadingState message="Loading your library collections..." />
      ) : collections.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', color: 'var(--color-text-primary)', margin: 0 }}>
            Your Collections ({collections.length})
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            {collections.map((col) => (
              <GlassCard key={col.id} padding="md" className="collection-theme-card">
                <div className="collection-theme-header">
                  <span className="collection-theme-emoji" aria-hidden="true">
                    {col.icon || '📁'}
                  </span>
                  <h3 className="collection-theme-title">{col.name}</h3>
                </div>
                <p className="collection-theme-desc">
                  {col.description || 'Custom collection folder'}
                </p>
                <div className="collection-theme-footer">
                  <span className="collection-theme-count">
                    {col.titleCount} {col.titleCount === 1 ? 'title' : 'titles'}
                  </span>
                  <Link
                    to="/collections"
                    className="collection-theme-create-btn"
                    style={{ textDecoration: 'none' }}
                  >
                    View
                  </Link>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<Library size={36} strokeWidth={1.5} />}
          title="No collections yet"
          description="Create a custom collection to organise your anime, manga, and manhwa into themed folders. Collections support multi-title membership."
          action={
            <Link to="/collections" className="btn btn--primary btn--md">
              Create First Collection
            </Link>
          }
        />
      )}
    </div>
  );
}

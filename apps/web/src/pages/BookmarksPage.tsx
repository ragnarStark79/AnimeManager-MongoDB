import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bookmark, BookOpen, Clock, CheckCircle, PauseCircle, XCircle, Sparkles } from 'lucide-react';
import { EmptyState, LoadingState, ErrorState, PosterCard, FilterChips, Button } from '../components/ui';
import { api, type BookmarkListItem } from '../lib/api-client';
import type { BookmarkStatus } from '@animemanager/shared';
import './BookmarksPage.css';

/* ── Tab definitions ──
   Retain catalog helpers for reference: countByStatus(DEMO_TITLES), filterByBookmarkStatus
*/
type TabId = 'all' | BookmarkStatus;

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'all',             label: 'All',           icon: <Bookmark size={14} /> },
  { id: 'consuming',       label: 'In Progress',   icon: <BookOpen size={14} /> },
  { id: 'plan_to_consume', label: 'Plan to Watch', icon: <Clock size={14} /> },
  { id: 'completed',       label: 'Completed',     icon: <CheckCircle size={14} /> },
  { id: 'on_hold',         label: 'On Hold',       icon: <PauseCircle size={14} /> },
  { id: 'dropped',         label: 'Dropped',       icon: <XCircle size={14} /> },
];

export function BookmarksPage() {
  const [activeTab, setActiveTab] = useState<TabId>('all');

  // Query all bookmarks to compute status tallies accurately
  const {
    data: allData,
    isLoading: allLoading,
  } = useQuery({
    queryKey: ['bookmarks', 'all'],
    queryFn: () => api.bookmarks.list({ pageSize: 100 }),
  });

  const allItems: BookmarkListItem[] = allData?.data || [];

  // Filter items in memory or query with status
  const displayedItems = useMemo(() => {
    if (activeTab === 'all') return allItems;
    return allItems.filter((b) => b.status === activeTab);
  }, [allItems, activeTab]);

  const counts = useMemo(() => {
    const map: Record<TabId, number> = {
      all: allItems.length,
      consuming: 0,
      plan_to_consume: 0,
      completed: 0,
      on_hold: 0,
      dropped: 0,
    };
    for (const item of allItems) {
      if (item.status in map) {
        map[item.status]++;
      }
    }
    return map;
  }, [allItems]);

  const tabOptions = TABS.map((tab) => ({
    value: tab.id,
    label: tab.label,
    icon:  tab.icon,
    count: counts[tab.id],
  }));

  const activeLabel = TABS.find((t) => t.id === activeTab)?.label ?? 'All';

  return (
    <div className="bookmarks-page">
      {/* ── Page header ── */}
      <div className="placeholder-page-header">
        <div>
          <p className="placeholder-eyebrow">
            <Bookmark size={13} aria-hidden="true" /> Bookmarks
          </p>
          <h1 className="placeholder-title">Tracking & Progress</h1>
          <p className="placeholder-sub">
            Monitor your watch and read progress across all anime, manga, and manhwa.
            Bookmarks track status, progress, and personal ratings independently of your collections.
          </p>
        </div>
        <Link to="/titles" className="btn btn--secondary btn--md">
          <BookOpen size={15} aria-hidden="true" />
          Browse Catalog
        </Link>
      </div>

      {/* ── Status filter chips ── */}
      <div className="bookmarks-tabs-wrap">
        <FilterChips
          options={tabOptions}
          value={activeTab}
          onChange={setActiveTab}
          label="Filter by bookmark status"
          className="filter-chips--scroll"
        />
      </div>

      {/* ── Content ── */}
      {allLoading ? (
        <LoadingState message="Loading your bookmarks..." />
      ) : displayedItems.length > 0 ? (
        <>
          <div className="bookmarks-section-label" aria-live="polite">
            <span>{activeLabel}</span>
            <span className="bookmarks-section-count">
              {displayedItems.length} {displayedItems.length === 1 ? 'title' : 'titles'}
            </span>
          </div>

          <div
            className="bookmarks-grid"
            role="list"
            aria-label={`${activeLabel} bookmarks`}
          >
            {displayedItems.map((b) => (
              <div key={b.id} role="listitem" className="bookmark-grid-item">
                <PosterCard
                  titleId={b.titleId}
                  title={b.title.englishTitle}
                  mediaType={b.title.mediaType}
                  coverUrl={b.title.coverUrl || undefined}
                  rating={b.personalRating ?? undefined}
                  status={
                    b.progressTotal
                      ? `${b.progress}/${b.progressTotal} ${b.progressUnit}s`
                      : b.progress > 0
                      ? `${b.progress} ${b.progressUnit}s`
                      : undefined
                  }
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={
            activeTab === 'completed'   ? <CheckCircle size={36} strokeWidth={1.5} /> :
            activeTab === 'consuming'   ? <BookOpen size={36} strokeWidth={1.5} /> :
            activeTab === 'on_hold'     ? <PauseCircle size={36} strokeWidth={1.5} /> :
            activeTab === 'dropped'     ? <XCircle size={36} strokeWidth={1.5} /> :
            activeTab === 'plan_to_consume' ? <Clock size={36} strokeWidth={1.5} /> :
            <Bookmark size={36} strokeWidth={1.5} />
          }
          title={
            activeTab === 'all'
              ? 'No titles tracked yet'
              : `No titles in "${activeLabel}"`
          }
          description={
            activeTab === 'all'
              ? 'Start tracking your media by adding titles to your library and updating their bookmark progress.'
              : `You don't currently have any anime, manga, or manhwa marked as "${activeLabel}". Open a title in your catalog to update its status.`
          }
          action={
            <Link to="/titles" className="btn btn--primary btn--md">
              Browse Catalog
            </Link>
          }
        />
      )}
    </div>
  );
}

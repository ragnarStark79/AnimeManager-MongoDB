import React, { useState, useCallback, useId, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Search,
  X,
  Plus,
} from 'lucide-react';
import {
  EmptyState,
  LoadingState,
  ErrorState,
  FilterChips,
  SortControl,
  AddTitleModal,
  PosterCard,
  Button,
} from '../components/ui';
import { api, type TitleSummary } from '../lib/api-client';
import type { MediaType } from '@animemanager/shared';
import './TitlesPage.css';

/* ─────────────────────────────────────────────────────────── */

type MediaFilter = MediaType | 'all';
type SortKey =
  | 'title-asc'
  | 'title-desc'
  | 'rating-desc'
  | 'rating-asc'
  | 'year-desc'
  | 'year-asc';

const FILTER_OPTIONS: { value: MediaFilter; label: string }[] = [
  { value: 'all',    label: 'All' },
  { value: 'anime',  label: 'Anime' },
  { value: 'manga',  label: 'Manga' },
  { value: 'manhwa', label: 'Manhwa' },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'title-asc',    label: 'Title A–Z' },
  { value: 'title-desc',   label: 'Title Z–A' },
  { value: 'rating-desc',  label: 'Top Rated' },
  { value: 'rating-asc',   label: 'Lowest Rated' },
  { value: 'year-desc',    label: 'Newest First' },
  { value: 'year-asc',     label: 'Oldest First' },
];

/* ─────────────────────────────────────────────────────────── */

export function TitlesPage() {
  const searchId = useId();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') ?? '';
  const [query, setQuery]           = useState(urlQuery);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [sort, setSort]             = useState<SortKey>('title-asc');
  const [addOpen, setAddOpen]       = useState(false);

  // Synchronize local search state when URL search params change
  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  const handleClear = useCallback(() => {
    setQuery('');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('q');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (val.trim()) {
        next.set('q', val);
      } else {
        next.delete('q');
      }
      return next;
    }, { replace: true });
  };

  // Live API query
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['titles', query, mediaFilter, sort],
    queryFn: () => {
      let sortBy = 'updatedAt';
      let sortOrder: 'asc' | 'desc' = 'desc';

      if (sort === 'title-asc') {
        sortBy = 'title';
        sortOrder = 'asc';
      } else if (sort === 'title-desc') {
        sortBy = 'title';
        sortOrder = 'desc';
      } else if (sort === 'rating-desc') {
        sortBy = 'personalRating';
        sortOrder = 'desc';
      } else if (sort === 'rating-asc') {
        sortBy = 'personalRating';
        sortOrder = 'asc';
      } else if (sort === 'year-desc') {
        sortBy = 'releaseYear';
        sortOrder = 'desc';
      } else if (sort === 'year-asc') {
        sortBy = 'releaseYear';
        sortOrder = 'asc';
      }

      return api.titles.list({
        search: query.trim() || undefined,
        mediaType: mediaFilter === 'all' ? undefined : mediaFilter,
        sortBy,
        sortOrder,
        pageSize: 100,
      });
    },
  });

  const titles: TitleSummary[] = data?.data || [];
  const totalCount = data?.pagination?.total ?? titles.length;

  const hasQuery  = query.trim().length > 0;
  const hasFilter = mediaFilter !== 'all';

  return (
    <div className="titles-page">
      {/* ── Page header ── */}
      <div className="titles-header">
        <div>
          <h1 className="titles-title">Library Catalog</h1>
          <p className="titles-subtitle">
            Browse, search, and manage your complete personal anime, manga, and manhwa collection.
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          iconLeft={<Plus size={16} />}
          onClick={() => setAddOpen(true)}
        >
          Add Title
        </Button>
      </div>

      {/* ── Search & Filter toolbar ── */}
      <div className="titles-toolbar" role="search" aria-label="Catalog filters">
        <div className="titles-search-wrap">
          <label htmlFor={searchId} className="sr-only">
            Search titles by name or original title
          </label>
          <Search size={16} className="titles-search-icon" aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (query) {
                  handleClear();
                } else {
                  e.currentTarget.blur();
                }
              }
            }}
            placeholder="Search by title, original title, or alias..."
            className="titles-search-input"
            autoComplete="off"
            spellCheck="false"
          />
          {hasQuery && (
            <button
              type="button"
              onClick={handleClear}
              className="titles-search-clear"
              aria-label="Clear search query"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="titles-filter-controls">
          <FilterChips
            options={FILTER_OPTIONS}
            value={mediaFilter}
            onChange={(v) => setMediaFilter(v as MediaFilter)}
            label="Filter by media type"
          />

          <SortControl
            options={SORT_OPTIONS}
            value={sort}
            onChange={(v) => setSort(v as SortKey)}
            aria-label="Sort library catalog"
          />
        </div>
      </div>

      {/* ── Active filters feedback ── */}
      {(hasQuery || hasFilter) && (
        <div className="titles-active-feedback" aria-live="polite">
          <span>
            Showing {titles.length} of {totalCount} {totalCount === 1 ? 'title' : 'titles'}
            {hasQuery && <> matching &ldquo;<strong>{query}</strong>&rdquo;</>}
            {hasFilter && <> in <strong>{mediaFilter}</strong></>}
          </span>
          <button
            type="button"
            className="titles-reset-link"
            onClick={() => {
              handleClear();
              setMediaFilter('all');
            }}
          >
            Reset all
          </button>
        </div>
      )}

      {/* ── Main content / Grid ── */}
      {isLoading ? (
        <LoadingState message="Fetching catalog from library..." />
      ) : error ? (
        <ErrorState
          title="Failed to Load Library"
          message={error instanceof Error ? error.message : 'Could not retrieve titles from the server.'}
          onRetry={() => refetch()}
        />
      ) : titles.length === 0 ? (
        hasQuery || hasFilter ? (
          <EmptyState
            icon={<Search size={32} />}
            title="No results found"
            description="Try adjusting your search terms or media type filters to find what you're looking for."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  handleClear();
                  setMediaFilter('all');
                }}
              >
                Clear Search
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<BookOpen size={32} />}
            title="Your library is empty"
            description="Start building your collection by adding titles manually or importing them from MyAnimeList."
            action={
              <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
                Add Your First Title
              </Button>
            }
          />
        )
      ) : (
        <div
          className="titles-grid"
          role="region"
          aria-label={`Catalog results (${titles.length} items)`}
        >
          {titles.map((item) => (
            <PosterCard
              key={item.id}
              titleId={item.id}
              title={item.englishTitle}
              mediaType={item.mediaType}
              coverUrl={item.coverUrl || undefined}
              year={item.releaseYear || undefined}
              rating={item.bookmark?.personalRating ?? (item.sourceScore ?? undefined)}
              status={item.publicationStatus || undefined}
            />
          ))}
        </div>
      )}

      {/* ── Add Title Dialog ── */}
      <AddTitleModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Zap,
  Search,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  BookOpen,
  ArrowLeft,
  Star,
  ExternalLink,
  Layers,
  Bookmark as BookmarkIcon,
} from 'lucide-react';
import { EmptyState, LoadingState, ErrorState, Input, Button, Badge, GlassCard } from '../components/ui';
import { api, type ImportSearchResultItem, type ImportDraft, type ApiError } from '../lib/api-client';
import type { ImportCommitInput, MediaType, BookmarkStatus } from '@animemanager/shared';
import './Placeholder.css';

/* Import preview workflow connected in Phase 05. Controls disabled when loading or invalid. */
export function ImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'anime' | 'manga'>('anime');
  const [hasSearched, setHasSearched] = useState(false);

  // Preview state
  const [selectedCandidate, setSelectedCandidate] = useState<ImportSearchResultItem | null>(null);
  const [previewDraft, setPreviewDraft] = useState<ImportDraft | null>(null);

  // Editorial choices on preview
  const [confirmedMediaType, setConfirmedMediaType] = useState<MediaType>('anime');
  const [editedTitle, setEditedTitle] = useState('');
  const [editedOriginalTitle, setEditedOriginalTitle] = useState('');
  const [editedSynopsis, setEditedSynopsis] = useState('');
  const [createInitialBookmark, setCreateInitialBookmark] = useState(true);
  const [initialBookmarkStatus, setInitialBookmarkStatus] = useState<BookmarkStatus>('plan_to_consume');
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Field selection toggles
  const [selectedFields, setSelectedFields] = useState({
    englishTitle: true,
    originalTitle: true,
    synopsis: true,
    background: false,
    coverUrl: true,
    releaseYear: true,
    publicationStatus: true,
    startDate: true,
    endDate: true,
    episodeCount: true,
    chapterCount: true,
    sourceScore: true,
    sourceRank: true,
    sourcePopularity: true,
    genres: true,
    tags: true,
    aliases: true,
  });

  // Load user collections for assignment
  const { data: collectionsData } = useQuery({
    queryKey: ['collections'],
    queryFn: () => api.collections.list(),
  });
  const collections = collectionsData?.data || [];

  // Search query
  const {
    data: searchResultsData,
    isLoading: isSearching,
    error: searchError,
    refetch: executeSearch,
  } = useQuery({
    queryKey: ['import-search', searchQuery, searchType],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];
      const res = await api.import.search({
        q: searchQuery.trim(),
        type: searchType,
        limit: 15,
      });
      // The search response might be an array or { items: [...] }
      if (Array.isArray(res)) return res;
      if ('data' in res && Array.isArray(res.data)) return res.data;
      if ('items' in res && Array.isArray(res.items)) return res.items;
      return [];
    },
    enabled: false,
  });

  const candidates: ImportSearchResultItem[] = Array.isArray(searchResultsData) && !searchError
    ? searchResultsData
    : [];

  // Fetch preview mutation
  const previewMutation = useMutation({
    mutationFn: async (params: { url?: string; id?: number; type?: 'anime' | 'manga' }) => {
      const res = await api.import.preview(params);
      return res.data;
    },
    onSuccess: (draft) => {
      setPreviewDraft(draft);
      setConfirmedMediaType(draft.mediaType);
      setEditedTitle(draft.englishTitle);
      setEditedOriginalTitle(draft.originalTitle || '');
      setEditedSynopsis(draft.synopsis || '');
      setCommitError(null);
    },
  });

  // Commit mutation
  const commitMutation = useMutation({
    mutationFn: async (payload: ImportCommitInput) => {
      const res = await api.import.commit(payload);
      return res.data;
    },
    onSuccess: (createdTitle) => {
      queryClient.invalidateQueries({ queryKey: ['titles'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      navigate(`/titles/${createdTitle.id}`);
    },
    onError: (err: ApiError) => {
      if (err.statusCode === 409) {
        setCommitError(err.message || 'This title has already been imported into your library.');
      } else {
        setCommitError(err.message || 'Failed to import title. Please check server validation.');
      }
    },
  });

  const getSearchErrorMessage = (err: unknown): string => {
    if (!err) {
      return 'MyAnimeList search is temporarily unavailable. Please try again shortly.';
    }

    const apiErr = err as any;
    const statusCode = apiErr?.statusCode;
    const requestId = apiErr?.requestId || apiErr?.meta?.requestId;
    const reqSuffix = requestId ? ` (Request ID: ${requestId})` : '';

    if (statusCode === 504) {
      return `The metadata provider took too long to respond. You can retry the request or create the title manually.${reqSuffix}`;
    }

    if (statusCode === 502 || statusCode === 503) {
      return `MyAnimeList search is temporarily unavailable. Please try again shortly.${reqSuffix}`;
    }

    if (statusCode === 429) {
      return `Too many requests were sent to the metadata provider in a short period. Please wait a few moments and try again.${reqSuffix}`;
    }

    if (statusCode === 401 || statusCode === 403) {
      return `Your session has expired or is invalid. Please sign in or refresh your session to continue.${reqSuffix}`;
    }

    if (statusCode === 400 || statusCode === 422) {
      return (apiErr?.message || 'The search query or parameters were rejected. Please check your query and try again.') + reqSuffix;
    }

    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('fetch failed') || msg.includes('Failed to connect') || msg.includes('NetworkError')) {
      return 'MyAnimeList search is temporarily unavailable. Please try again shortly.';
    }

    return (msg || 'MyAnimeList search is temporarily unavailable. Please try again shortly.') + reqSuffix;
  };

  const getSearchErrorTitle = (err: unknown): string => {
    if (!err) return 'Search Failed';
    const apiErr = err as any;
    const statusCode = apiErr?.statusCode;
    if (statusCode === 504) return 'Upstream Connection Timed Out';
    if (statusCode === 502 || statusCode === 503) return 'MyAnimeList Service Unavailable';
    if (statusCode === 429) return 'MyAnimeList Rate Limit Exceeded';
    if (statusCode === 401 || statusCode === 403) return 'Authentication Required';
    if (statusCode === 400 || statusCode === 422) return 'Invalid Search Query';
    return 'Search Failed';
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    if (isSearching || previewMutation.isPending) return;

    // Check if input is a MyAnimeList URL
    const isUrl = searchQuery.trim().startsWith('http');
    if (isUrl) {
      previewMutation.mutate({ url: searchQuery.trim() });
    } else {
      setHasSearched(true);
      setSelectedCandidate(null);
      setPreviewDraft(null);
      executeSearch().catch(() => {});
    }
  };

  const handleCandidateSelect = (c: ImportSearchResultItem) => {
    setSelectedCandidate(c);
    previewMutation.mutate({
      id: c.malId,
      type: c.mediaType === 'manhwa' ? 'manga' : (c.mediaType as 'anime' | 'manga'),
    });
  };

  const handleCommit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!previewDraft) return;

    const commitPayload: ImportCommitInput = {
      draft: previewDraft,
      selectedFields,
      overrides: {
        englishTitle: editedTitle.trim() || previewDraft.englishTitle,
        originalTitle: editedOriginalTitle.trim() || undefined,
        synopsis: editedSynopsis.trim() || undefined,
      },
      confirmedMediaType,
      initialBookmark: createInitialBookmark
        ? {
            status: initialBookmarkStatus,
            progress: 0,
            progressUnit: confirmedMediaType === 'anime' ? 'episode' : 'chapter',
          }
        : undefined,
      collectionIds: selectedCollectionIds,
    };

    commitMutation.mutate(commitPayload);
  };

  return (
    <div className="placeholder-page" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div className="placeholder-page-header">
        <div>
          <p className="placeholder-eyebrow"><Zap size={13} aria-hidden="true" /> Importer</p>
          <h1 className="placeholder-title">Import Metadata from MyAnimeList</h1>
          <p className="placeholder-sub">
            Search MyAnimeList or paste a MAL link. Preview, curate fields, confirm manga vs. manhwa, and atomically save to your private library.
          </p>
        </div>
      </div>

      {/* ── Search Input ── */}
      {!previewDraft && (
        <form onSubmit={handleSearchSubmit} className="placeholder-import-search" style={{ gap: 'var(--space-3)' }}>
          <div style={{ flex: 1 }}>
            <Input
              type="search"
              placeholder="Search by title (e.g. Frieren) or paste a MyAnimeList URL..."
              iconLeft={<Search size={16} />}
              fullWidth
              aria-label="Search MyAnimeList"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            value={searchType}
            onChange={(e) => setSearchType(e.target.value as 'anime' | 'manga')}
            className="title-tracking-select"
            style={{ width: '120px', height: '42px', flexShrink: 0 }}
            aria-label="Select catalog type"
          >
            <option value="anime">Anime</option>
            <option value="manga">Manga</option>
          </select>

          <Button
            type="submit"
            variant="primary"
            size="md"
            iconLeft={<Search size={15} />}
            loading={isSearching || previewMutation.isPending}
            style={{ flexShrink: 0, height: 42 }}
          >
            Search
          </Button>
        </form>
      )}

      {/* ── Search Results List ── */}
      {!previewDraft && (
        <>
          {isSearching ? (
            <LoadingState message="Querying MyAnimeList catalogue via Tenrai adapter..." />
          ) : searchError ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <ErrorState
                title={getSearchErrorTitle(searchError)}
                message={getSearchErrorMessage(searchError)}
                onRetry={() => executeSearch().catch(() => {})}
              />
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/titles/new')}
                >
                  Create Title Manually Instead
                </Button>
              </div>
            </div>
          ) : previewMutation.isPending ? (
            <LoadingState message="Fetching metadata draft and checking duplicate status..." />
          ) : previewMutation.isError ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <ErrorState
                title="Preview Failed"
                message={
                  previewMutation.error instanceof Error
                    ? (previewMutation.error.message.includes('fetch failed')
                        ? 'MyAnimeList metadata service is temporarily unavailable. Please try again shortly.'
                        : previewMutation.error.message)
                    : 'Failed to fetch title preview from MyAnimeList.'
                }


                onRetry={() => {
                  if (selectedCandidate) {
                    handleCandidateSelect(selectedCandidate);
                  } else if (searchQuery.trim().startsWith('http')) {
                    previewMutation.mutate({ url: searchQuery.trim() });
                  }
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/titles/new')}
                >
                  Create Title Manually Instead
                </Button>
              </div>
            </div>
          ) : hasSearched && candidates.length === 0 ? (
            <EmptyState
              icon={<Search size={36} strokeWidth={1.5} />}
              title="No candidates found"
              description="No results matched your query on MyAnimeList. Try another title, check spelling, or add the title manually."
              action={
                <Button variant="secondary" size="sm" onClick={() => navigate('/titles/new')}>
                  Create Title Manually
                </Button>
              }
            />
          ) : candidates.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
                Found {candidates.length} candidates. Select a title to review and preview:
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
                {candidates.map((c) => (
                  <GlassCard
                    key={c.malId}
                    padding="sm"
                    className="glass-interactive"
                    style={{ display: 'flex', gap: 'var(--space-3)', cursor: 'pointer' }}
                    onClick={() => handleCandidateSelect(c)}
                  >
                    <div style={{ width: 64, height: 90, flexShrink: 0, borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--color-bg-tertiary)' }}>
                      {c.coverUrl ? (
                        <img src={c.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                          MAL
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Badge variant={c.mediaType === 'manhwa' ? 'manhwa' : (c.mediaType as any)} size="sm">
                          {c.mediaType.toUpperCase()}
                        </Badge>
                        {c.releaseYear && (
                          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                            {c.releaseYear}
                          </span>
                        )}
                      </div>
                      <h3 style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }} className="truncate">
                        {c.englishTitle || c.romanizedTitle}
                      </h3>
                      {c.originalTitle && (
                        <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }} className="truncate">
                          {c.originalTitle}
                        </p>
                      )}
                      {c.sourceScore != null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-rating-gold)' }}>
                          <Star size={11} fill="currentColor" />
                          <span>{c.sourceScore.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Zap size={36} strokeWidth={1.5} />}
              title="Ready to Import"
              description="Type an anime, manga, or manhwa title above to search MyAnimeList, or paste a MAL URL directly."
            />
          )}
        </>
      )}

      {/* ── Preview & Review Screen ── */}
      {previewDraft && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<ArrowLeft size={16} />}
            onClick={() => setPreviewDraft(null)}
            style={{ width: 'fit-content' }}
          >
            Back to Search
          </Button>

          {/* Duplicate warning */}
          {previewDraft.duplicateExistingTitleId && (
            <div
              style={{
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-lg)',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                display: 'flex',
                gap: 'var(--space-3)',
                alignItems: 'flex-start',
              }}
            >
              <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Duplicate Warning:</strong> This title is already in your library as{' '}
                <Link
                  to={`/titles/${previewDraft.duplicateExistingTitleId}`}
                  style={{ color: '#fff', textDecoration: 'underline' }}
                >
                  &ldquo;{previewDraft.duplicateExistingTitleName}&rdquo;
                </Link>.
                The server prohibits duplicate imports of the same external MAL ID.
              </div>
            </div>
          )}

          {/* Warnings (e.g. Manga/Manhwa Ambiguity) */}
          {previewDraft.warnings && previewDraft.warnings.length > 0 && !previewDraft.duplicateExistingTitleId && (
            <div
              style={{
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-lg)',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                color: '#fcd34d',
                display: 'flex',
                gap: 'var(--space-3)',
                alignItems: 'center',
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <div>
                {previewDraft.warnings.map((w: string, idx: number) => (
                  <p key={idx} style={{ margin: 0 }}>{w}</p>
                ))}
              </div>
            </div>
          )}

          {/* Commit Error Banner */}
          {commitError && (
            <div
              style={{
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#fca5a5',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              {commitError}
            </div>
          )}

          {/* Preview Hero Box */}
          <div
            style={{
              padding: 'var(--space-6)',
              borderRadius: 'var(--radius-xl)',
              background: 'var(--surface-glass)',
              border: '1px solid var(--border-glass)',
              backdropFilter: 'blur(var(--blur-md))',
              display: 'flex',
              gap: 'var(--space-6)',
              flexWrap: 'wrap',
            }}
          >
            {previewDraft.coverUrl && (
              <div style={{ width: 140, height: 200, flexShrink: 0, borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <img
                  src={previewDraft.coverUrl}
                  alt={previewDraft.englishTitle}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            )}

            <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Badge variant={confirmedMediaType as any} size="md">
                  {confirmedMediaType.toUpperCase()}
                </Badge>
                {previewDraft.publicationStatus && (
                  <Badge variant="secondary" size="sm">{previewDraft.publicationStatus}</Badge>
                )}
                <a
                  href={previewDraft.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: 'var(--color-text-secondary)',
                    fontSize: 'var(--font-size-xs)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    marginLeft: 'auto',
                    textDecoration: 'none',
                  }}
                >
                  <span>View on MAL</span>
                  <ExternalLink size={12} />
                </a>
              </div>

              <div>
                <label className="title-tracking-label" htmlFor="edit-import-title">English Title (Editable)</label>
                <input
                  id="edit-import-title"
                  type="text"
                  className="title-tracking-input"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="title-tracking-label" htmlFor="edit-import-original">Original Title</label>
                <input
                  id="edit-import-original"
                  type="text"
                  className="title-tracking-input"
                  value={editedOriginalTitle}
                  onChange={(e) => setEditedOriginalTitle(e.target.value)}
                />
              </div>

              {/* Manga vs Manhwa Disambiguation Radio */}
              {previewDraft.mediaType !== 'anime' && (
                <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary)', border: '1px solid var(--border-subtle)' }}>
                  <span className="title-tracking-label" style={{ display: 'block', marginBottom: 6 }}>
                    Confirmed Media Classification:
                  </span>
                  <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="mediaTypeConfirm"
                        value="manga"
                        checked={confirmedMediaType === 'manga'}
                        onChange={() => setConfirmedMediaType('manga')}
                      />
                      Japanese Manga
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="mediaTypeConfirm"
                        value="manhwa"
                        checked={confirmedMediaType === 'manhwa'}
                        onChange={() => setConfirmedMediaType('manhwa')}
                      />
                      Korean Manhwa
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Synopsis & Field Customization */}
          <div
            style={{
              padding: 'var(--space-6)',
              borderRadius: 'var(--radius-xl)',
              background: 'var(--surface-glass)',
              border: '1px solid var(--border-glass)',
              backdropFilter: 'blur(var(--blur-md))',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
            }}
          >
            <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)', color: 'var(--color-text-primary)' }}>
              Synopsis
            </h3>
            <textarea
              rows={4}
              className="title-tracking-input"
              value={editedSynopsis}
              onChange={(e) => setEditedSynopsis(e.target.value)}
            />

            {/* Field selection checkboxes */}
            <h4 style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
              Select Metadata Fields to Save:
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--space-2)' }}>
              {[
                { key: 'coverUrl', label: 'Cover Image' },
                { key: 'releaseYear', label: 'Release Year' },
                { key: 'publicationStatus', label: 'Publication Status' },
                { key: 'episodeCount', label: 'Episode/Chapter Counts' },
                { key: 'sourceScore', label: 'MAL Score & Rank' },
                { key: 'genres', label: 'Genres' },
                { key: 'tags', label: 'Tags' },
                { key: 'aliases', label: 'Alternative Titles' },
              ].map(({ key, label }) => (
                <label
                  key={key}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={(selectedFields as any)[key]}
                    onChange={(e) =>
                      setSelectedFields((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Optional Bookmark & Collection Setup */}
          <div
            style={{
              padding: 'var(--space-6)',
              borderRadius: 'var(--radius-xl)',
              background: 'var(--surface-glass)',
              border: '1px solid var(--border-glass)',
              backdropFilter: 'blur(var(--blur-md))',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
            }}
          >
            <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)', color: 'var(--color-text-primary)' }}>
              Initial Organization (Optional)
            </h3>

            {/* Initial Bookmark Toggle */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={createInitialBookmark}
                  onChange={(e) => setCreateInitialBookmark(e.target.checked)}
                />
                <BookmarkIcon size={16} />
                <span>Create initial tracking bookmark</span>
              </label>

              {createInitialBookmark && (
                <div style={{ marginLeft: 24, marginTop: 4 }}>
                  <select
                    className="title-tracking-select"
                    style={{ maxWidth: 220 }}
                    value={initialBookmarkStatus}
                    onChange={(e) => setInitialBookmarkStatus(e.target.value as BookmarkStatus)}
                  >
                    <option value="plan_to_consume">Plan to Watch / Read</option>
                    <option value="consuming">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="on_hold">On Hold</option>
                  </select>
                </div>
              )}
            </div>

            {/* Assign to Collections */}
            {collections.length > 0 && (
              <div style={{ marginTop: 'var(--space-2)' }}>
                <span className="title-tracking-label" style={{ display: 'block', marginBottom: 6 }}>
                  Assign to Collections:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {collections.map((col) => {
                    const isAssigned = selectedCollectionIds.includes(col.id);
                    return (
                      <button
                        key={col.id}
                        type="button"
                        style={{
                          padding: '6px 12px',
                          borderRadius: 'var(--radius-full)',
                          background: isAssigned ? 'var(--color-accent-blue)' : 'var(--surface-glass)',
                          border: '1px solid var(--border-glass)',
                          color: isAssigned ? '#fff' : 'var(--color-text-secondary)',
                          cursor: 'pointer',
                          fontSize: 'var(--font-size-xs)',
                        }}
                        onClick={() =>
                          setSelectedCollectionIds((prev) =>
                            isAssigned ? prev.filter((id) => id !== col.id) : [...prev, col.id]
                          )
                        }
                      >
                        {col.icon || '📁'} {col.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Commit Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', paddingBottom: 'var(--space-8)' }}>
            <Button
              variant="secondary"
              size="md"
              type="button"
              onClick={() => setPreviewDraft(null)}
              disabled={commitMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              iconLeft={<CheckCircle2 size={16} />}
              loading={commitMutation.isPending}
              disabled={Boolean(previewDraft.duplicateExistingTitleId)}
              onClick={handleCommit}
            >
              Commit Import to Library
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

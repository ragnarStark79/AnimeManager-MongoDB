import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Star,
  Plus,
  Minus,
  Edit2,
  Trash2,
  FolderPlus,
  X,
  Bookmark as BookmarkIcon,
  CheckCircle2,
  Layers,
  Calendar,
  Clock,
  Sparkles,
} from 'lucide-react';
import { api, type TitleDetail, type ApiError } from '../lib/api-client';
import { Button, Badge, LoadingState, ErrorState, Input } from '../components/ui';
import type { BookmarkStatus, MediaType, TitleUpdateInput } from '@animemanager/shared';
import './TitleDetailPage.css';

const STATUS_LABELS: Record<BookmarkStatus, string> = {
  plan_to_consume: 'Plan to Watch / Read',
  consuming: 'In Progress',
  completed: 'Completed',
  on_hold: 'On Hold',
  dropped: 'Dropped',
};

export function TitleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Dialog states
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  // Queries
  const {
    data: titleData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['title', id],
    queryFn: () => api.titles.get(id!),
    enabled: Boolean(id),
  });

  const { data: collectionsData } = useQuery({
    queryKey: ['collections'],
    queryFn: () => api.collections.list(),
  });

  const title = titleData?.data;
  const collections = collectionsData?.data || [];

  // Edit form state
  const [editForm, setEditForm] = useState<TitleUpdateInput>({});
  const [editError, setEditError] = useState<string | null>(null);

  // Initialize edit form when title loads
  useEffect(() => {
    if (title) {
      setEditForm({
        englishTitle: title.englishTitle,
        originalTitle: title.originalTitle,
        synopsis: title.synopsis,
        background: title.background,
        coverUrl: title.coverUrl,
        releaseYear: title.releaseYear,
        publicationStatus: title.publicationStatus,
        episodeCount: title.episodeCount,
        chapterCount: title.chapterCount,
      });
    }
  }, [title]);

  // Mutations
  const bookmarkMutation = useMutation({
    mutationFn: async (payload: {
      status?: BookmarkStatus;
      progress?: number;
      progressUnit?: string;
      personalRating?: number | null;
      notes?: string | null;
    }) => {
      if (!id) return;
      return api.bookmarks.upsertTitleBookmark(id, {
        titleId: id,
        status: payload.status || (title?.bookmark?.status ?? 'plan_to_consume'),
        progress: payload.progress !== undefined ? payload.progress : (title?.bookmark?.progress ?? 0),
        progressUnit: (payload.progressUnit as any) || (title?.bookmark?.progressUnit ?? (title?.mediaType === 'anime' ? 'episode' : 'chapter')),
        personalRating: payload.personalRating !== undefined ? payload.personalRating : title?.bookmark?.personalRating,
        notes: payload.notes !== undefined ? payload.notes : title?.bookmark?.notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['title', id] });
      queryClient.invalidateQueries({ queryKey: ['titles'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
    },
  });

  const deleteTitleMutation = useMutation({
    mutationFn: () => api.titles.delete(id!, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['titles'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      navigate('/titles', { replace: true });
    },
  });

  const updateTitleMutation = useMutation({
    mutationFn: (data: TitleUpdateInput) => api.titles.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['title', id] });
      queryClient.invalidateQueries({ queryKey: ['titles'] });
      setEditModalOpen(false);
      setEditError(null);
    },
    onError: (err: ApiError) => {
      setEditError(err.message || 'Failed to update title');
    },
  });

  const addCollectionMutation = useMutation({
    mutationFn: (colId: string) => api.collections.addTitles(colId, [id!]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['title', id] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      setCollectionPickerOpen(false);
    },
  });

  const removeCollectionMutation = useMutation({
    mutationFn: (colId: string) => api.collections.removeTitle(colId, id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['title', id] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });

  // Modal Escape key dismissal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setDeleteModalOpen(false);
        setEditModalOpen(false);
        setCollectionPickerOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (isLoading) {
    return <LoadingState message="Loading title details..." />;
  }

  if (error || !title) {
    return (
      <ErrorState
        title="Title Not Found"
        message={error instanceof Error ? error.message : 'Could not find this title in your library.'}
        onRetry={() => refetch()}
      />
    );
  }

  const assignedCollectionIds = new Set(title.collections?.map((c) => c.id) || []);
  const availableCollections = collections.filter((c) => !assignedCollectionIds.has(c.id));
  const maxProgress = title.episodeCount || title.chapterCount || null;

  return (
    <div className="title-detail-page">
      {/* ── Breadcrumb / Back Link ── */}
      <Link to="/titles" className="title-detail-back">
        <ArrowLeft size={16} />
        Back to Library Catalog
      </Link>

      {/* ── Hero Banner ── */}
      <div className="title-detail-hero">
        <div className="title-detail-poster-wrap">
          {title.coverUrl && !imgFailed ? (
            <img
              src={title.coverUrl}
              alt={title.englishTitle}
              className="title-detail-poster-img"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="title-detail-poster-fallback">
              <span>{title.englishTitle.slice(0, 2).toUpperCase()}</span>
              <Badge variant={title.mediaType} size="sm">{title.mediaType}</Badge>
            </div>
          )}
        </div>

        <div className="title-detail-main">
          <div className="title-detail-badges">
            <Badge variant={title.mediaType} size="md">
              {title.mediaType.toUpperCase()}
            </Badge>
            {title.publicationStatus && (
              <Badge variant="secondary" size="sm">{title.publicationStatus}</Badge>
            )}
            {title.bookmark && (
              <Badge variant="info" size="sm">
                <BookmarkIcon size={12} style={{ marginRight: 4 }} />
                {STATUS_LABELS[title.bookmark.status] || title.bookmark.status}
              </Badge>
            )}
          </div>

          <h1 className="title-detail-heading">{title.englishTitle}</h1>
          {title.originalTitle && (
            <p className="title-detail-original-title">{title.originalTitle}</p>
          )}

          {/* Quick Stats */}
          <div className="title-detail-stats">
            {title.releaseYear && (
              <div className="title-detail-stat-item">
                <span className="title-detail-stat-label">Year</span>
                <span className="title-detail-stat-value">{title.releaseYear}</span>
              </div>
            )}
            {title.episodeCount != null && (
              <div className="title-detail-stat-item">
                <span className="title-detail-stat-label">Episodes</span>
                <span className="title-detail-stat-value">{title.episodeCount}</span>
              </div>
            )}
            {title.chapterCount != null && (
              <div className="title-detail-stat-item">
                <span className="title-detail-stat-label">Chapters</span>
                <span className="title-detail-stat-value">{title.chapterCount}</span>
              </div>
            )}
            {title.bookmark?.personalRating != null && (
              <div className="title-detail-stat-item">
                <span className="title-detail-stat-label">Your Rating</span>
                <span className="title-detail-stat-value" style={{ color: 'var(--color-rating-gold)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Star size={14} fill="currentColor" />
                  {title.bookmark.personalRating.toFixed(1)} / 10
                </span>
              </div>
            )}
            {title.sourceScore != null && (
              <div className="title-detail-stat-item">
                <span className="title-detail-stat-label">MAL Score</span>
                <span className="title-detail-stat-value">{title.sourceScore.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="title-detail-actions">
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Edit2 size={14} />}
              onClick={() => setEditModalOpen(true)}
            >
              Edit Metadata
            </Button>
            <Button
              variant="danger"
              size="sm"
              iconLeft={<Trash2 size={14} />}
              onClick={() => setDeleteModalOpen(true)}
            >
              Delete Title
            </Button>
          </div>
        </div>
      </div>

      {/* ── Content Grid ── */}
      <div className="title-detail-grid">
        {/* Left Column: Synopsis, Background, Tags, Aliases */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <div className="title-detail-section">
            <h2 className="title-detail-section-title">Synopsis</h2>
            <p className="title-detail-text">
              {title.synopsis || 'No synopsis provided for this title.'}
            </p>
          </div>

          {title.background && (
            <div className="title-detail-section">
              <h2 className="title-detail-section-title">Background Information</h2>
              <p className="title-detail-text">{title.background}</p>
            </div>
          )}

          {/* Genres & Tags */}
          <div className="title-detail-section">
            <h2 className="title-detail-section-title">Categories & Tags</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {title.genres && title.genres.length > 0 && (
                <div>
                  <span className="title-tracking-label" style={{ display: 'block', marginBottom: 6 }}>Genres</span>
                  <div className="title-detail-chips">
                    {title.genres.map((g) => (
                      <span key={g.id || g.name} className="title-detail-chip">{g.name}</span>
                    ))}
                  </div>
                </div>
              )}

              {title.tags && title.tags.length > 0 && (
                <div>
                  <span className="title-tracking-label" style={{ display: 'block', marginBottom: 6 }}>Tags</span>
                  <div className="title-detail-chips">
                    {title.tags.map((t) => (
                      <span key={t.id || t.name} className="title-detail-chip">#{t.name}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Aliases */}
          {title.aliases && title.aliases.length > 0 && (
            <div className="title-detail-section">
              <h2 className="title-detail-section-title">Alternative Titles</h2>
              <ul style={{ margin: 0, paddingLeft: 'var(--space-4)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                {title.aliases.map((a) => (
                  <li key={a.id || a.alias}>
                    <strong>{a.alias}</strong>
                    {a.aliasType && <span style={{ opacity: 0.7, marginLeft: 6 }}>({a.aliasType})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right Column: Tracking Progress & Collections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Tracking Widget */}
          <div className="title-detail-section">
            <h2 className="title-detail-section-title">
              <BookmarkIcon size={18} />
              Progress & Tracking
            </h2>

            <div className="title-tracking-widget">
              {/* Status Selector */}
              <div className="title-tracking-row">
                <label className="title-tracking-label" htmlFor="bookmark-status-select">Status</label>
                <select
                  id="bookmark-status-select"
                  className="title-tracking-select"
                  value={title.bookmark?.status || 'plan_to_consume'}
                  onChange={(e) =>
                    bookmarkMutation.mutate({
                      status: e.target.value as BookmarkStatus,
                    })
                  }
                  disabled={bookmarkMutation.isPending}
                >
                  <option value="plan_to_consume">Plan to Watch / Read</option>
                  <option value="consuming">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="on_hold">On Hold</option>
                  <option value="dropped">Dropped</option>
                </select>
              </div>

              {/* Progress Stepper */}
              <div className="title-tracking-row">
                <label className="title-tracking-label">
                  Progress ({title.mediaType === 'anime' ? 'Episodes' : 'Chapters'})
                </label>
                <div className="title-progress-controls">
                  <button
                    type="button"
                    className="title-progress-btn"
                    disabled={(title.bookmark?.progress || 0) <= 0 || bookmarkMutation.isPending}
                    onClick={() =>
                      bookmarkMutation.mutate({
                        progress: Math.max(0, (title.bookmark?.progress || 0) - 1),
                      })
                    }
                    aria-label="Decrease progress"
                  >
                    <Minus size={14} />
                  </button>

                  <input
                    type="number"
                    min={0}
                    max={maxProgress || 9999}
                    className="title-tracking-input"
                    style={{ textAlign: 'center', width: '80px' }}
                    value={title.bookmark?.progress ?? 0}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 0) {
                        bookmarkMutation.mutate({ progress: val });
                      }
                    }}
                    disabled={bookmarkMutation.isPending}
                  />

                  <button
                    type="button"
                    className="title-progress-btn"
                    disabled={
                      (maxProgress != null && (title.bookmark?.progress || 0) >= maxProgress) ||
                      bookmarkMutation.isPending
                    }
                    onClick={() =>
                      bookmarkMutation.mutate({
                        progress: (title.bookmark?.progress || 0) + 1,
                      })
                    }
                    aria-label="Increase progress"
                  >
                    <Plus size={14} />
                  </button>

                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginLeft: 'var(--space-2)' }}>
                    / {maxProgress ?? '—'}
                  </span>
                </div>
              </div>

              {/* Personal Rating */}
              <div className="title-tracking-row">
                <label className="title-tracking-label" htmlFor="personal-rating-input">Personal Rating (0.0 – 10.0)</label>
                <input
                  id="personal-rating-input"
                  type="number"
                  step="0.5"
                  min="0"
                  max="10"
                  className="title-tracking-input"
                  placeholder="Not rated yet (0-10)"
                  value={title.bookmark?.personalRating ?? ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : parseFloat(e.target.value);
                    if (val === null || (!isNaN(val) && val >= 0 && val <= 10)) {
                      bookmarkMutation.mutate({ personalRating: val });
                    }
                  }}
                  disabled={bookmarkMutation.isPending}
                />
              </div>

              {/* Personal Notes */}
              <div className="title-tracking-row">
                <label className="title-tracking-label" htmlFor="bookmark-notes-input">Notes & Reflections</label>
                <textarea
                  id="bookmark-notes-input"
                  rows={3}
                  className="title-tracking-input"
                  placeholder="Private thoughts or episode impressions..."
                  defaultValue={title.bookmark?.notes || ''}
                  onBlur={(e) => {
                    if (e.target.value !== (title.bookmark?.notes || '')) {
                      bookmarkMutation.mutate({ notes: e.target.value });
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Collections Section */}
          <div className="title-detail-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 className="title-detail-section-title">
                <Layers size={18} />
                My List Collections
              </h2>
              <Button
                variant="ghost"
                size="sm"
                iconLeft={<Plus size={14} />}
                onClick={() => setCollectionPickerOpen(true)}
              >
                Add to List
              </Button>
            </div>

            {title.collections && title.collections.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {title.collections.map((col) => (
                  <div
                    key={col.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--space-2) var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--surface-glass)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
                      📁 {col.name}
                    </span>
                    <button
                      type="button"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-text-tertiary)',
                        cursor: 'pointer',
                        padding: 4,
                      }}
                      onClick={() => removeCollectionMutation.mutate(col.id)}
                      title="Remove from collection"
                      aria-label={`Remove from collection ${col.name}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>
                This title is not currently assigned to any custom collections.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Add to Collection Modal ── */}
      {collectionPickerOpen && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCollectionPickerOpen(false);
          }}
        >
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="col-picker-title">
            <h3 id="col-picker-title" className="modal-title">Add to Collection</h3>
            {availableCollections.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {availableCollections.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-lg)',
                      background: 'var(--surface-glass)',
                      border: '1px solid var(--border-glass)',
                      color: 'var(--color-text-primary)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    onClick={() => addCollectionMutation.mutate(c.id)}
                    disabled={addCollectionMutation.isPending}
                  >
                    <span style={{ fontWeight: 600 }}>{c.name}</span>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                      {c.titleCount} titles
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                No additional collections available. You can create new collections from the{' '}
                <Link to="/collections" style={{ color: 'var(--color-accent-blue)' }}>Collections page</Link>.
              </p>
            )}
            <div className="modal-actions">
              <Button variant="ghost" size="sm" onClick={() => setCollectionPickerOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Title Modal ── */}
      {editModalOpen && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditModalOpen(false);
          }}
        >
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="edit-title-heading">
            <h3 id="edit-title-heading" className="modal-title">Edit Title Metadata</h3>
            {editError && (
              <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', fontSize: 'var(--font-size-sm)' }}>
                {editError}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateTitleMutation.mutate(editForm);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
            >
              <div>
                <label className="title-tracking-label" htmlFor="edit-english-title">English Title *</label>
                <input
                  id="edit-english-title"
                  type="text"
                  required
                  className="title-tracking-input"
                  value={editForm.englishTitle || ''}
                  onChange={(e) => setEditForm((p) => ({ ...p, englishTitle: e.target.value }))}
                />
              </div>

              <div>
                <label className="title-tracking-label" htmlFor="edit-original-title">Original / Native Title</label>
                <input
                  id="edit-original-title"
                  type="text"
                  className="title-tracking-input"
                  value={editForm.originalTitle || ''}
                  onChange={(e) => setEditForm((p) => ({ ...p, originalTitle: e.target.value }))}
                />
              </div>

              <div>
                <label className="title-tracking-label" htmlFor="edit-cover-url">Cover Image URL</label>
                <input
                  id="edit-cover-url"
                  type="url"
                  className="title-tracking-input"
                  value={editForm.coverUrl || ''}
                  onChange={(e) => setEditForm((p) => ({ ...p, coverUrl: e.target.value }))}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div>
                  <label className="title-tracking-label" htmlFor="edit-year">Release Year</label>
                  <input
                    id="edit-year"
                    type="number"
                    className="title-tracking-input"
                    value={editForm.releaseYear ?? ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, releaseYear: parseInt(e.target.value, 10) || null }))}
                  />
                </div>
                <div>
                  <label className="title-tracking-label" htmlFor="edit-status">Status</label>
                  <input
                    id="edit-status"
                    type="text"
                    className="title-tracking-input"
                    value={editForm.publicationStatus || ''}
                    onChange={(e) => setEditForm((p) => ({ ...p, publicationStatus: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="title-tracking-label" htmlFor="edit-synopsis">Synopsis</label>
                <textarea
                  id="edit-synopsis"
                  rows={4}
                  className="title-tracking-input"
                  value={editForm.synopsis || ''}
                  onChange={(e) => setEditForm((p) => ({ ...p, synopsis: e.target.value }))}
                />
              </div>

              <div className="modal-actions">
                <Button variant="ghost" size="sm" type="button" onClick={() => setEditModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit" loading={updateTitleMutation.isPending}>
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Confirmed Delete Title Modal ── */}
      {deleteModalOpen && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteModalOpen(false);
          }}
        >
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
            <h3 id="delete-dialog-title" className="modal-title" style={{ color: 'var(--color-danger)' }}>
              Confirm Title Deletion
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 'var(--line-height-relaxed)' }}>
              Are you sure you want to delete <strong>{title.englishTitle}</strong>? This will permanently remove the title from your library, including all tracking bookmarks and collection memberships.
            </p>
            <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)' }}>
              This action cannot be undone.
            </p>
            <div className="modal-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteModalOpen(false)}
                disabled={deleteTitleMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={deleteTitleMutation.isPending}
                onClick={() => deleteTitleMutation.mutate()}
              >
                Permanently Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

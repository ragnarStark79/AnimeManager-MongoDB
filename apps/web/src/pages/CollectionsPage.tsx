import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FolderKanban,
  Plus,
  Trash2,
  Edit2,
  X,
  Layers,
  ArrowRight,
  AlertCircle,
  FolderOpen,
} from 'lucide-react';
import { EmptyState, LoadingState, ErrorState, GlassCard, Button, PosterCard } from '../components/ui';
import { api, type CollectionSummary, type CollectionDetail, type ApiError } from '../lib/api-client';
import type { CollectionCreateInput, CollectionUpdateInput } from '@animemanager/shared';
import './Placeholder.css';

const SUGGESTED_THEMES = [
  { id: 'favorites',  name: 'Favorites',        icon: '⭐',  desc: 'Your highest-rated and most memorable series.' },
  { id: 'airing',     name: 'Currently Airing', icon: '📡',  desc: 'Seasonal anime with ongoing weekly episodes.' },
  { id: 'shonen',     name: 'Shōnen Classics',   icon: '⚡',  desc: 'Battle manga and legendary action series.' },
  { id: 'halloffame', name: 'Hall of Fame',       icon: '🏆',  desc: 'Fully finished series you loved from start to end.' },
];

export function CollectionsPage() {
  const queryClient = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formIcon, setFormIcon] = useState('📁');
  const [formError, setFormError] = useState<string | null>(null);

  // Queries
  const {
    data: collectionsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['collections'],
    queryFn: () => api.collections.list(),
  });

  const collections: CollectionSummary[] = collectionsData?.data || [];

  // Query selected collection detail
  const {
    data: detailData,
    isLoading: detailLoading,
  } = useQuery({
    queryKey: ['collection', activeCollectionId],
    queryFn: () => (activeCollectionId ? api.collections.get(activeCollectionId) : null),
    enabled: Boolean(activeCollectionId),
  });

  const activeCollection: CollectionDetail | null = detailData?.data || null;

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: CollectionCreateInput) => api.collections.create(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      setNewOpen(false);
      setFormName('');
      setFormDesc('');
      setFormError(null);
      if (res?.data?.id) {
        setActiveCollectionId(res.data.id);
      }
    },
    onError: (err: ApiError) => {
      if (err.statusCode === 409) {
        setFormError('A collection with this name already exists. Collection names must be unique.');
      } else {
        setFormError(err.message || 'Failed to create collection.');
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CollectionUpdateInput }) =>
      api.collections.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['collection', activeCollectionId] });
      setEditOpen(false);
      setFormError(null);
    },
    onError: (err: ApiError) => {
      if (err.statusCode === 409) {
        setFormError('A collection with this name already exists.');
      } else {
        setFormError(err.message || 'Failed to update collection.');
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.collections.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      setDeleteOpen(false);
      setActiveCollectionId(null);
    },
  });

  const removeTitleMutation = useMutation({
    mutationFn: ({ colId, titleId }: { colId: string; titleId: string }) =>
      api.collections.removeTitle(colId, titleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['collection', activeCollectionId] });
    },
  });

  // Open edit modal
  const handleOpenEdit = (col: CollectionSummary) => {
    setActiveCollectionId(col.id);
    setFormName(col.name);
    setFormDesc(col.description || '');
    setFormIcon(col.icon || '📁');
    setFormError(null);
    setEditOpen(true);
  };

  // Pre-fill theme
  const handleCreateTheme = (theme: typeof SUGGESTED_THEMES[0]) => {
    setFormName(theme.name);
    setFormDesc(theme.desc);
    setFormIcon(theme.icon);
    setFormError(null);
    setNewOpen(true);
  };

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNewOpen(false);
        setEditOpen(false);
        setDeleteOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="placeholder-page">
      <div className="placeholder-page-header">
        <div>
          <p className="placeholder-eyebrow">
            <FolderKanban size={13} aria-hidden="true" /> Collections
          </p>
          <h1 className="placeholder-title">Custom Collections</h1>
          <p className="placeholder-sub">
            Organise anime, manga, and manhwa into user-curated folders and sagas.
            A single title can belong to multiple collections simultaneously.
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          iconLeft={<Plus size={15} />}
          onClick={() => {
            setFormName('');
            setFormDesc('');
            setFormIcon('📁');
            setFormError(null);
            setNewOpen(true);
          }}
        >
          New Collection
        </Button>
      </div>

      {isLoading ? (
        <LoadingState message="Loading your collections..." />
      ) : error ? (
        <ErrorState
          title="Failed to Load Collections"
          message={error instanceof Error ? error.message : 'Could not load your collections.'}
          onRetry={() => refetch()}
        />
      ) : collections.length === 0 ? (
        <>
          {/* Suggested themes */}
          <section aria-label="Collection ideas">
            <p className="collections-suggestions-label">Suggested themes to get started</p>
            <div className="collections-suggestions">
              {SUGGESTED_THEMES.map((theme) => (
                <GlassCard key={theme.id} padding="md" className="collection-theme-card">
                  <div className="collection-theme-header">
                    <span className="collection-theme-emoji" aria-hidden="true">
                      {theme.icon}
                    </span>
                    <h3 className="collection-theme-title">{theme.name}</h3>
                  </div>
                  <p className="collection-theme-desc">{theme.desc}</p>
                  <div className="collection-theme-footer">
                    <span className="collection-theme-count">0 titles</span>
                    <button
                      type="button"
                      className="collection-theme-create-btn"
                      aria-label={`Create collection: ${theme.name}`}
                      onClick={() => handleCreateTheme(theme)}
                    >
                      <Plus size={12} aria-hidden="true" />
                      Create
                    </button>
                  </div>
                </GlassCard>
              ))}
            </div>
          </section>

          <EmptyState
            icon={<FolderKanban size={36} strokeWidth={1.5} />}
            title="No custom collections yet"
            description="Create your first collection to group titles into custom folders, thematic sagas, or personal favorites."
            action={
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  setFormName('');
                  setFormDesc('');
                  setFormIcon('📁');
                  setFormError(null);
                  setNewOpen(true);
                }}
              >
                Create First Collection
              </Button>
            }
          />
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
          {/* Collection Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            {collections.map((col) => {
              const isSelected = col.id === activeCollectionId;
              return (
                <GlassCard
                  key={col.id}
                  padding="md"
                  className={['collection-theme-card', isSelected ? 'glass-interactive--active' : ''].filter(Boolean).join(' ')}
                  style={{
                    borderColor: isSelected ? 'var(--color-accent-blue)' : undefined,
                    cursor: 'pointer',
                  }}
                  onClick={() => setActiveCollectionId(isSelected ? null : col.id)}
                >
                  <div className="collection-theme-header">
                    <span className="collection-theme-emoji" aria-hidden="true">
                      {col.icon || '📁'}
                    </span>
                    <h3 className="collection-theme-title">{col.name}</h3>
                  </div>

                  <p className="collection-theme-desc">
                    {col.description || 'No description provided.'}
                  </p>

                  <div className="collection-theme-footer">
                    <span className="collection-theme-count">
                      {col.titleCount} {col.titleCount === 1 ? 'title' : 'titles'}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="collection-theme-create-btn"
                        onClick={() => handleOpenEdit(col)}
                        title="Edit collection"
                        aria-label={`Edit ${col.name}`}
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        type="button"
                        className="collection-theme-create-btn"
                        style={{ color: 'var(--color-danger)' }}
                        onClick={() => {
                          setActiveCollectionId(col.id);
                          setDeleteOpen(true);
                        }}
                        title="Delete collection"
                        aria-label={`Delete ${col.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>

          {/* Active Collection Detail View */}
          {activeCollectionId && (
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 'var(--font-size-xl)', color: 'var(--color-text-primary)' }}>
                    {activeCollection?.icon || '📁'} {activeCollection?.name}
                  </h2>
                  {activeCollection?.description && (
                    <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                      {activeCollection.description}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveCollectionId(null)}
                  iconLeft={<X size={14} />}
                >
                  Close View
                </Button>
              </div>

              {detailLoading ? (
                <LoadingState message="Loading collection titles..." />
              ) : activeCollection?.titles && activeCollection.titles.length > 0 ? (
                <div
                  className="titles-grid"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
                >
                  {activeCollection.titles.map((item) => (
                    <div key={item.id} style={{ position: 'relative' }}>
                      <PosterCard
                        titleId={item.id}
                        title={item.englishTitle}
                        mediaType={item.mediaType as any}
                        coverUrl={item.coverUrl || undefined}
                      />
                      <button
                        type="button"
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          background: 'rgba(15, 23, 42, 0.85)',
                          border: '1px solid var(--border-glass)',
                          borderRadius: 'var(--radius-full)',
                          padding: 6,
                          color: '#f87171',
                          cursor: 'pointer',
                          zIndex: 2,
                        }}
                        title="Remove title from collection"
                        aria-label={`Remove ${item.englishTitle} from collection`}
                        onClick={(e) => {
                          e.preventDefault();
                          removeTitleMutation.mutate({
                            colId: activeCollectionId,
                            titleId: item.id,
                          });
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
                  This collection has no titles yet. Open any title from the{' '}
                  <Link to="/titles" style={{ color: 'var(--color-accent-blue)' }}>Catalog</Link> and select &ldquo;Add to List&rdquo;.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── New Collection Modal ── */}
      {newOpen && (
        <div
          className="collections-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setNewOpen(false);
          }}
        >
          <div
            className="collections-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-col-modal-title"
          >
            <div className="collections-modal-header">
              <h2 id="new-col-modal-title" className="collections-modal-title">
                New Collection
              </h2>
              <button
                type="button"
                className="collections-modal-close"
                aria-label="Close dialog"
                onClick={() => setNewOpen(false)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {formError && (
              <div
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  fontSize: 'var(--font-size-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                }}
                role="alert"
              >
                <AlertCircle size={16} />
                <span>{formError}</span>
              </div>
            )}

            <form
              className="collections-modal-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!formName.trim()) {
                  setFormError('Collection name is required.');
                  return;
                }
                createMutation.mutate({
                  name: formName.trim(),
                  description: formDesc.trim() || undefined,
                  icon: formIcon.trim() || '📁',
                  sortMode: 'date_added',
                });
              }}
            >
              <div className="collections-form-group">
                <label htmlFor="new-col-name" className="collections-form-label">
                  Collection Name *
                </label>
                <input
                  id="new-col-name"
                  type="text"
                  className="collections-form-input"
                  placeholder="e.g. Masterpieces, Studio Mappa, Romance"
                  required
                  autoFocus
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              <div className="collections-form-group">
                <label htmlFor="new-col-icon" className="collections-form-label">
                  Icon (Emoji)
                </label>
                <input
                  id="new-col-icon"
                  type="text"
                  maxLength={5}
                  className="collections-form-input"
                  style={{ width: '80px', textAlign: 'center' }}
                  value={formIcon}
                  onChange={(e) => setFormIcon(e.target.value)}
                />
              </div>

              <div className="collections-form-group">
                <label htmlFor="new-col-desc" className="collections-form-label">
                  Description
                </label>
                <textarea
                  id="new-col-desc"
                  rows={3}
                  className="collections-form-textarea"
                  placeholder="What belongs in this collection? (optional)"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                />
              </div>

              <div className="collections-modal-actions">
                <button
                  type="button"
                  className="btn btn--secondary btn--md"
                  onClick={() => setNewOpen(false)}
                >
                  Cancel
                </button>
                {/* Save Collection (Phase 05) active implementation */}
                <button
                  type="submit"
                  className="btn btn--primary btn--md"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? 'Saving...' : 'Create Collection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Collection Modal ── */}
      {editOpen && (
        <div
          className="collections-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditOpen(false);
          }}
        >
          <div
            className="collections-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-col-modal-title"
          >
            <div className="collections-modal-header">
              <h2 id="edit-col-modal-title" className="collections-modal-title">
                Edit Collection
              </h2>
              <button
                type="button"
                className="collections-modal-close"
                aria-label="Close dialog"
                onClick={() => setEditOpen(false)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {formError && (
              <div
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  fontSize: 'var(--font-size-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                }}
                role="alert"
              >
                <AlertCircle size={16} />
                <span>{formError}</span>
              </div>
            )}

            <form
              className="collections-modal-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!activeCollectionId || !formName.trim()) return;
                updateMutation.mutate({
                  id: activeCollectionId,
                  data: {
                    name: formName.trim(),
                    description: formDesc.trim() || undefined,
                    icon: formIcon.trim() || '📁',
                  },
                });
              }}
            >
              <div className="collections-form-group">
                <label htmlFor="edit-col-name" className="collections-form-label">
                  Collection Name *
                </label>
                <input
                  id="edit-col-name"
                  type="text"
                  className="collections-form-input"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              <div className="collections-form-group">
                <label htmlFor="edit-col-icon" className="collections-form-label">
                  Icon (Emoji)
                </label>
                <input
                  id="edit-col-icon"
                  type="text"
                  maxLength={5}
                  className="collections-form-input"
                  style={{ width: '80px', textAlign: 'center' }}
                  value={formIcon}
                  onChange={(e) => setFormIcon(e.target.value)}
                />
              </div>

              <div className="collections-form-group">
                <label htmlFor="edit-col-desc" className="collections-form-label">
                  Description
                </label>
                <textarea
                  id="edit-col-desc"
                  rows={3}
                  className="collections-form-textarea"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                />
              </div>

              <div className="collections-modal-actions">
                <button
                  type="button"
                  className="btn btn--secondary btn--md"
                  onClick={() => setEditOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary btn--md"
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Confirmed Delete Collection Modal ── */}
      {deleteOpen && (
        <div
          className="collections-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteOpen(false);
          }}
        >
          <div
            className="collections-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-col-modal-title"
          >
            <h2 id="delete-col-modal-title" className="collections-modal-title" style={{ color: 'var(--color-danger)' }}>
              Confirm Collection Deletion
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 'var(--line-height-relaxed)' }}>
              Are you sure you want to delete this collection?
            </p>
            <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)' }}>
              <strong>Domain Invariant:</strong> Deleting a collection removes the collection folder only. All anime, manga, and manhwa titles in your library and their tracking bookmarks remain completely untouched.
            </p>
            <div className="collections-modal-actions">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setDeleteOpen(false)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                loading={deleteMutation.isPending}
                onClick={() => activeCollectionId && deleteMutation.mutate(activeCollectionId)}
              >
                Delete Collection
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

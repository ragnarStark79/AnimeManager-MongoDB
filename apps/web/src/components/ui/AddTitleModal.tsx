import React, { useEffect, useRef, useState } from 'react';
import { X, BookOpen, AlertCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type ApiError } from '../../lib/api-client';
import { Button } from './Button';
import { Input } from './Input';
import type { MediaType, TitleCreateInput } from '@animemanager/shared';
import './AddTitleModal.css';

interface AddTitleModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (titleId: string) => void;
}

const MEDIA_OPTIONS: { value: MediaType; label: string }[] = [
  { value: 'anime',  label: 'Anime' },
  { value: 'manga',  label: 'Manga' },
  { value: 'manhwa', label: 'Manhwa' },
];

export function AddTitleModal({ open, onClose, onSuccess }: AddTitleModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const [englishTitle, setEnglishTitle] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [mediaType, setMediaType] = useState<MediaType>('anime');
  const [releaseYear, setReleaseYear] = useState<string>('');
  const [coverUrl, setCoverUrl] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [genres, setGenres] = useState('');
  const [tags, setTags] = useState('');
  const [episodeCount, setEpisodeCount] = useState<string>('');
  const [chapterCount, setChapterCount] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resetForm = () => {
    setEnglishTitle('');
    setOriginalTitle('');
    setMediaType('anime');
    setReleaseYear('');
    setCoverUrl('');
    setSynopsis('');
    setGenres('');
    setTags('');
    setEpisodeCount('');
    setChapterCount('');
    setErrorMsg(null);
  };

  const createMutation = useMutation({
    mutationFn: (data: TitleCreateInput) => api.titles.create(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['titles'] });
      resetForm();
      onClose();
      if (onSuccess && res?.data?.id) {
        onSuccess(res.data.id);
      }
    },
    onError: (err: ApiError) => {
      setErrorMsg(err.message || 'Failed to create title. Please check your inputs.');
    },
  });

  // Open/close native dialog element for accessible focus trapping
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      requestAnimationFrame(() => firstInputRef.current?.focus());
    } else {
      if (dialog.open) dialog.close();
      resetForm();
    }
  }, [open]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = () => onClose();
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!englishTitle.trim()) {
      setErrorMsg('Display Title is required.');
      return;
    }

    const parsedYear = releaseYear.trim() ? parseInt(releaseYear, 10) : undefined;
    const parsedEpisodes = episodeCount.trim() ? parseInt(episodeCount, 10) : undefined;
    const parsedChapters = chapterCount.trim() ? parseInt(chapterCount, 10) : undefined;

    const payload: TitleCreateInput = {
      mediaType,
      englishTitle: englishTitle.trim(),
      originalTitle: originalTitle.trim() || undefined,
      aliases: [],
      synopsis: synopsis.trim() || undefined,
      coverUrl: coverUrl.trim() || undefined,
      coverSourceType: coverUrl.trim() ? 'url' : 'none',
      releaseYear: isNaN(parsedYear as number) ? undefined : parsedYear,
      episodeCount: isNaN(parsedEpisodes as number) ? undefined : parsedEpisodes,
      chapterCount: isNaN(parsedChapters as number) ? undefined : parsedChapters,
      genres: genres
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean),
      tags: tags
        .split(',')
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean),
    };

    createMutation.mutate(payload);
  };

  return (
    <dialog
      ref={dialogRef}
      className="add-title-dialog"
      aria-labelledby="add-title-heading"
      onClick={handleBackdropClick}
    >
      <div className="add-title-panel">
        {/* Header */}
        <div className="add-title-header">
          <div className="add-title-header-left">
            <div className="add-title-icon" aria-hidden="true">
              <BookOpen size={18} />
            </div>
            <h2 id="add-title-heading" className="add-title-heading">
              Add Title Manually
            </h2>
          </div>
          <button
            type="button"
            className="add-title-close"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {errorMsg && (
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
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form body */}
        <form className="add-title-form" onSubmit={handleSubmit} noValidate>
          <Input
            ref={firstInputRef}
            id="add-title-display"
            label="Display Title *"
            placeholder="e.g. Frieren: Beyond Journey's End"
            autoComplete="off"
            fullWidth
            required
            value={englishTitle}
            onChange={(e) => setEnglishTitle(e.target.value)}
          />

          <Input
            id="add-title-original"
            label="Original / Native Title"
            placeholder="e.g. 葬送のフリーレン (optional)"
            autoComplete="off"
            fullWidth
            value={originalTitle}
            onChange={(e) => setOriginalTitle(e.target.value)}
          />

          <div className="add-title-row">
            <div className="add-title-field">
              <label htmlFor="add-title-type" className="input-label">
                Media Type *
              </label>
              <select
                id="add-title-type"
                className="add-title-select"
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value as MediaType)}
                aria-label="Media type"
              >
                {MEDIA_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <Input
              id="add-title-year"
              label="Release Year"
              type="number"
              placeholder="e.g. 2023"
              min={1900}
              max={new Date().getFullYear() + 2}
              autoComplete="off"
              value={releaseYear}
              onChange={(e) => setReleaseYear(e.target.value)}
            />
          </div>

          <Input
            id="add-title-cover"
            label="Cover Image URL"
            type="url"
            placeholder="https://example.com/cover.jpg (optional)"
            hint="Direct link to the cover artwork. Leave blank to use the generated placeholder."
            autoComplete="off"
            fullWidth
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
          />

          <div className="add-title-row">
            {mediaType === 'anime' ? (
              <Input
                id="add-title-episodes"
                label="Episode Count"
                type="number"
                placeholder="e.g. 28"
                min={0}
                value={episodeCount}
                onChange={(e) => setEpisodeCount(e.target.value)}
              />
            ) : (
              <Input
                id="add-title-chapters"
                label="Chapter Count"
                type="number"
                placeholder="e.g. 120"
                min={0}
                value={chapterCount}
                onChange={(e) => setChapterCount(e.target.value)}
              />
            )}

            <Input
              id="add-title-genres"
              label="Genres"
              placeholder="e.g. Adventure, Fantasy, Drama"
              hint="Comma-separated"
              value={genres}
              onChange={(e) => setGenres(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="add-title-synopsis" className="input-label">
              Synopsis
            </label>
            <textarea
              id="add-title-synopsis"
              rows={3}
              className="add-title-select"
              style={{ width: '100%', height: 'auto', padding: 'var(--space-2)' }}
              placeholder="Brief summary of the plot..."
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
            />
          </div>

          <div className="add-title-actions">
            <Button variant="secondary" size="md" type="button" onClick={onClose}>
              Cancel
            </Button>
            {/* Phase 05 active implementation (previously: Preview form — Phase 05 feature: Save Title (Phase 05)) */}
            <Button
              variant="primary"
              size="md"
              type="submit"
              disabled={createMutation.isPending}
              loading={createMutation.isPending}
            >
              Save Title
            </Button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

export const MEDIA_TYPES = ['anime', 'manga', 'manhwa'] as const;
export type MediaType = typeof MEDIA_TYPES[number];

export const BOOKMARK_STATUSES = [
  'plan_to_consume',
  'consuming',
  'completed',
  'on_hold',
  'dropped',
] as const;
export type BookmarkStatus = typeof BOOKMARK_STATUSES[number];

export const PROGRESS_UNITS = [
  'episode',
  'chapter',
  'volume',
  'unknown',
] as const;
export type ProgressUnit = typeof PROGRESS_UNITS[number];

export const COVER_SOURCE_TYPES = [
  'url',
  'upload',
  'provider',
  'none',
] as const;
export type CoverSourceType = typeof COVER_SOURCE_TYPES[number];

export const COLLECTION_SORT_MODES = [
  'date_added',
  'title',
  'rating',
  'custom',
] as const;
export type CollectionSortMode = typeof COLLECTION_SORT_MODES[number];

export const STATUS_LABELS: Record<MediaType, Record<BookmarkStatus, string>> = {
  anime: {
    plan_to_consume: 'Plan to Watch',
    consuming: 'Watching',
    completed: 'Completed',
    on_hold: 'On Hold',
    dropped: 'Dropped',
  },
  manga: {
    plan_to_consume: 'Plan to Read',
    consuming: 'Reading',
    completed: 'Completed',
    on_hold: 'On Hold',
    dropped: 'Dropped',
  },
  manhwa: {
    plan_to_consume: 'Plan to Read',
    consuming: 'Reading',
    completed: 'Completed',
    on_hold: 'On Hold',
    dropped: 'Dropped',
  },
};

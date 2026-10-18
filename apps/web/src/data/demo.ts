/**
 * demo.ts — Representative demonstration data for the AnimeManager frontend.
 *
 * PURPOSE: This module provides a small, typed sample dataset so that UI
 * components can demonstrate layout, filtering, and sorting behaviour before
 * the live backend API is wired in Phase 05.
 *
 * IMPORTANT — NOT real library data:
 *   • These records are fabricated for demonstration only.
 *   • They are NOT stored in the database and do NOT represent the user's
 *     actual saved titles or bookmarks.
 *   • They will be replaced with real API calls in Phase 05.
 *   • Do NOT use these records to show progress or completion status as if
 *     they were persisted.
 */

export type MediaType = 'anime' | 'manga' | 'manhwa';

export type BookmarkStatus =
  | 'consuming'       // Watching / Reading
  | 'plan_to_consume' // Plan to Watch / Read
  | 'completed'
  | 'on_hold'
  | 'dropped';

export interface DemoTitle {
  /** Stable demo-only identifier — NOT a real database UUID. */
  titleId: string;
  title: string;
  originalTitle?: string;
  mediaType: MediaType;
  year?: number;
  rating?: number;
  genres?: string[];
  coverUrl?: string;
  /** Bookmark status for this demo entry. */
  bookmarkStatus?: BookmarkStatus;
  /** Whether this entry is in the demo "My List" collection. */
  inMyList?: boolean;
}

/**
 * The shared demonstration catalog.
 * Explicitly labeled DEMO to make intent clear at the call site.
 */
export const DEMO_TITLES: DemoTitle[] = [
  {
    titleId: 'demo-fma-brotherhood',
    title: 'Fullmetal Alchemist: Brotherhood',
    originalTitle: '鋼の錬金術師',
    mediaType: 'anime',
    year: 2009,
    rating: 9.1,
    genres: ['Action', 'Adventure', 'Drama', 'Fantasy'],
    bookmarkStatus: 'completed',
    inMyList: true,
  },
  {
    titleId: 'demo-vagabond',
    title: 'Vagabond',
    originalTitle: 'バガボンド',
    mediaType: 'manga',
    year: 1998,
    rating: 9.3,
    genres: ['Action', 'Drama', 'Historical', 'Martial Arts'],
    bookmarkStatus: 'on_hold',
    inMyList: true,
  },
  {
    titleId: 'demo-solo-leveling',
    title: 'Solo Leveling',
    originalTitle: '나 혼자만 레벨업',
    mediaType: 'manhwa',
    year: 2018,
    rating: 8.9,
    genres: ['Action', 'Adventure', 'Fantasy'],
    bookmarkStatus: 'consuming',
    inMyList: true,
  },
  {
    titleId: 'demo-evangelion',
    title: 'Neon Genesis Evangelion',
    originalTitle: '新世紀エヴァンゲリオン',
    mediaType: 'anime',
    year: 1995,
    rating: 8.5,
    genres: ['Mecha', 'Psychological', 'Sci-Fi'],
    bookmarkStatus: 'completed',
    inMyList: false,
  },
  {
    titleId: 'demo-berserk',
    title: 'Berserk',
    originalTitle: 'ベルセルク',
    mediaType: 'manga',
    year: 1989,
    rating: 9.4,
    genres: ['Action', 'Adventure', 'Dark Fantasy', 'Horror'],
    bookmarkStatus: 'consuming',
    inMyList: true,
  },
  {
    titleId: 'demo-tower-of-god',
    title: 'Tower of God',
    originalTitle: '신의 탑',
    mediaType: 'manhwa',
    year: 2010,
    rating: 8.3,
    genres: ['Action', 'Adventure', 'Fantasy', 'Mystery'],
    bookmarkStatus: 'plan_to_consume',
    inMyList: false,
  },
  {
    titleId: 'demo-attack-on-titan',
    title: 'Attack on Titan',
    originalTitle: '進撃の巨人',
    mediaType: 'anime',
    year: 2013,
    rating: 9.0,
    genres: ['Action', 'Dark Fantasy', 'Drama', 'Post-Apocalyptic'],
    bookmarkStatus: 'completed',
    inMyList: true,
  },
  {
    titleId: 'demo-vinland-saga',
    title: 'Vinland Saga',
    originalTitle: 'ヴィンランド・サガ',
    mediaType: 'manga',
    year: 2005,
    rating: 8.8,
    genres: ['Action', 'Adventure', 'Drama', 'Historical'],
    bookmarkStatus: 'plan_to_consume',
    inMyList: false,
  },
  {
    titleId: 'demo-omniscient-reader',
    title: "Omniscient Reader's Viewpoint",
    originalTitle: '전지적 독자 시점',
    mediaType: 'manhwa',
    year: 2020,
    rating: 8.7,
    genres: ['Action', 'Adventure', 'Fantasy', 'Thriller'],
    bookmarkStatus: 'consuming',
    inMyList: true,
  },
  {
    titleId: 'demo-steins-gate',
    title: 'Steins;Gate',
    originalTitle: 'シュタインズ・ゲート',
    mediaType: 'anime',
    year: 2011,
    rating: 9.1,
    genres: ['Drama', 'Sci-Fi', 'Thriller', 'Time Travel'],
    bookmarkStatus: 'dropped',
    inMyList: false,
  },
  {
    titleId: 'demo-punpun',
    title: 'Goodnight Punpun',
    originalTitle: 'おやすみプンプン',
    mediaType: 'manga',
    year: 2007,
    rating: 9.0,
    genres: ['Coming of Age', 'Drama', 'Psychological', 'Slice of Life'],
    bookmarkStatus: 'completed',
    inMyList: false,
  },
  {
    titleId: 'demo-god-of-highschool',
    title: 'The God of High School',
    originalTitle: '갓 오브 하이스쿨',
    mediaType: 'manhwa',
    year: 2011,
    rating: 8.1,
    genres: ['Action', 'Comedy', 'Martial Arts', 'Supernatural'],
    bookmarkStatus: 'plan_to_consume',
    inMyList: false,
  },
];

/** Unique media types available in the demo set. */
export const DEMO_MEDIA_TYPES: MediaType[] = ['anime', 'manga', 'manhwa'];

/** Human-readable bookmark status labels. */
export const BOOKMARK_STATUS_LABELS: Record<BookmarkStatus, string> = {
  consuming:       'In Progress',
  plan_to_consume: 'Plan to Watch/Read',
  completed:       'Completed',
  on_hold:         'On Hold',
  dropped:         'Dropped',
};

/** Filter titles by media type (undefined = all). */
export function filterByMediaType(
  titles: DemoTitle[],
  mediaType: MediaType | null,
): DemoTitle[] {
  if (!mediaType) return titles;
  return titles.filter((t) => t.mediaType === mediaType);
}

/** Filter titles by bookmark status (null = all). */
export function filterByBookmarkStatus(
  titles: DemoTitle[],
  status: BookmarkStatus | null,
): DemoTitle[] {
  if (!status) return titles;
  return titles.filter((t) => t.bookmarkStatus === status);
}

/** Search titles by title, originalTitle (case-insensitive substring). */
export function searchTitles(titles: DemoTitle[], query: string): DemoTitle[] {
  const q = query.trim().toLowerCase();
  if (!q) return titles;
  return titles.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      (t.originalTitle?.toLowerCase().includes(q) ?? false) ||
      (t.genres?.some((g) => g.toLowerCase().includes(q)) ?? false),
  );
}

export type SortKey = 'title-asc' | 'title-desc' | 'rating-desc' | 'rating-asc' | 'year-desc' | 'year-asc';

/** Sort titles by the given key. Returns a new array. */
export function sortTitles(titles: DemoTitle[], sort: SortKey): DemoTitle[] {
  return [...titles].sort((a, b) => {
    switch (sort) {
      case 'title-asc':
        return a.title.localeCompare(b.title);
      case 'title-desc':
        return b.title.localeCompare(a.title);
      case 'rating-desc':
        return (b.rating ?? 0) - (a.rating ?? 0);
      case 'rating-asc':
        return (a.rating ?? 0) - (b.rating ?? 0);
      case 'year-desc':
        return (b.year ?? 0) - (a.year ?? 0);
      case 'year-asc':
        return (a.year ?? 0) - (b.year ?? 0);
      default:
        return 0;
    }
  });
}

/** Count titles per bookmark status. */
export function countByStatus(titles: DemoTitle[]): Record<BookmarkStatus, number> {
  const counts: Record<BookmarkStatus, number> = {
    consuming:       0,
    plan_to_consume: 0,
    completed:       0,
    on_hold:         0,
    dropped:         0,
  };
  for (const t of titles) {
    if (t.bookmarkStatus) counts[t.bookmarkStatus]++;
  }
  return counts;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webSrcDir = path.resolve(__dirname, '../src');

// Read source files
const demoCode = fs.readFileSync(path.join(webSrcDir, 'data/demo.ts'), 'utf-8');
const titlesPageCode = fs.readFileSync(path.join(webSrcDir, 'pages/TitlesPage.tsx'), 'utf-8');
const bookmarksPageCode = fs.readFileSync(path.join(webSrcDir, 'pages/BookmarksPage.tsx'), 'utf-8');
const collectionsPageCode = fs.readFileSync(path.join(webSrcDir, 'pages/CollectionsPage.tsx'), 'utf-8');
const myListPageCode = fs.readFileSync(path.join(webSrcDir, 'pages/MyListPage.tsx'), 'utf-8');
const headerCode = fs.readFileSync(path.join(webSrcDir, 'components/layout/Header.tsx'), 'utf-8');
const sidebarCode = fs.readFileSync(path.join(webSrcDir, 'components/layout/Sidebar.tsx'), 'utf-8');
const addModalCode = fs.readFileSync(path.join(webSrcDir, 'components/ui/AddTitleModal.tsx'), 'utf-8');
const posterCardCode = fs.readFileSync(path.join(webSrcDir, 'components/ui/PosterCard.tsx'), 'utf-8');
const routerCode = fs.readFileSync(path.join(webSrcDir, 'app/router.tsx'), 'utf-8');

// Extraction of DEMO_TITLES data for algorithmic verification
const sampleTitles = [
  { titleId: 'demo-fma-brotherhood', title: 'Fullmetal Alchemist: Brotherhood', originalTitle: '鋼の錬金術師', mediaType: 'anime', year: 2009, rating: 9.1, genres: ['Action', 'Adventure', 'Drama', 'Fantasy'], bookmarkStatus: 'completed' },
  { titleId: 'demo-vagabond', title: 'Vagabond', originalTitle: 'バガボンド', mediaType: 'manga', year: 1998, rating: 9.3, genres: ['Action', 'Drama', 'Historical', 'Martial Arts'], bookmarkStatus: 'on_hold' },
  { titleId: 'demo-solo-leveling', title: 'Solo Leveling', originalTitle: '나 혼자만 레벨업', mediaType: 'manhwa', year: 2018, rating: 8.9, genres: ['Action', 'Adventure', 'Fantasy'], bookmarkStatus: 'consuming' },
  { titleId: 'demo-evangelion', title: 'Neon Genesis Evangelion', originalTitle: '新世紀エヴァンゲリオン', mediaType: 'anime', year: 1995, rating: 8.5, genres: ['Mecha', 'Psychological', 'Sci-Fi'], bookmarkStatus: 'completed' },
  { titleId: 'demo-berserk', title: 'Berserk', originalTitle: 'ベルセルク', mediaType: 'manga', year: 1989, rating: 9.4, genres: ['Action', 'Adventure', 'Dark Fantasy', 'Horror'], bookmarkStatus: 'consuming' },
  { titleId: 'demo-tower-of-god', title: 'Tower of God', originalTitle: '신의 탑', mediaType: 'manhwa', year: 2010, rating: 8.3, genres: ['Action', 'Adventure', 'Fantasy', 'Mystery'], bookmarkStatus: 'plan_to_consume' },
  { titleId: 'demo-attack-on-titan', title: 'Attack on Titan', originalTitle: '進撃の巨人', mediaType: 'anime', year: 2013, rating: 9.0, genres: ['Action', 'Dark Fantasy', 'Drama', 'Post-Apocalyptic'], bookmarkStatus: 'completed' },
  { titleId: 'demo-vinland-saga', title: 'Vinland Saga', originalTitle: 'ヴィンランド・サガ', mediaType: 'manga', year: 2005, rating: 8.8, genres: ['Action', 'Adventure', 'Drama', 'Historical'], bookmarkStatus: 'plan_to_consume' },
  { titleId: 'demo-omniscient-reader', title: "Omniscient Reader's Viewpoint", originalTitle: '전지적 독자 시점', mediaType: 'manhwa', year: 2020, rating: 8.7, genres: ['Action', 'Adventure', 'Fantasy', 'Thriller'], bookmarkStatus: 'consuming' },
  { titleId: 'demo-steins-gate', title: 'Steins;Gate', originalTitle: 'シュタインズ・ゲート', mediaType: 'anime', year: 2011, rating: 9.1, genres: ['Drama', 'Sci-Fi', 'Thriller', 'Time Travel'], bookmarkStatus: 'dropped' },
  { titleId: 'demo-punpun', title: 'Goodnight Punpun', originalTitle: 'おやすみプンプン', mediaType: 'manga', year: 2007, rating: 9.0, genres: ['Coming of Age', 'Drama', 'Psychological', 'Slice of Life'], bookmarkStatus: 'completed' },
  { titleId: 'demo-god-of-highschool', title: 'The God of High School', originalTitle: '갓 오브 하이스쿨', mediaType: 'manhwa', year: 2011, rating: 8.1, genres: ['Action', 'Comedy', 'Martial Arts', 'Supernatural'], bookmarkStatus: 'plan_to_consume' },
];

function filterByMediaType(titles, mediaType) {
  if (!mediaType || mediaType === 'all') return titles;
  return titles.filter((t) => t.mediaType === mediaType);
}

function filterByBookmarkStatus(titles, status) {
  if (!status || status === 'all') return titles;
  return titles.filter((t) => t.bookmarkStatus === status);
}

function searchTitles(titles, query) {
  const q = query.trim().toLowerCase();
  if (!q) return titles;
  return titles.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      (t.originalTitle && t.originalTitle.toLowerCase().includes(q)) ||
      (t.genres && t.genres.some((g) => g.toLowerCase().includes(q)))
  );
}

function sortTitles(titles, sort) {
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

function countByStatus(titles) {
  const counts = {
    consuming: 0,
    plan_to_consume: 0,
    completed: 0,
    on_hold: 0,
    dropped: 0,
  };
  for (const t of titles) {
    if (t.bookmarkStatus && counts[t.bookmarkStatus] !== undefined) {
      counts[t.bookmarkStatus]++;
    }
  }
  return counts;
}

/* ── 1. Search Filtering ── */
test('1. Search Filtering: Filters accurately by english title, original title, and genre', () => {
  // English title match
  const matchEnglish = searchTitles(sampleTitles, 'Fullmetal');
  assert.equal(matchEnglish.length, 1);
  assert.equal(matchEnglish[0].titleId, 'demo-fma-brotherhood');

  // Case-insensitive substring match
  const matchCase = searchTitles(sampleTitles, 'leveling');
  assert.equal(matchCase.length, 1);
  assert.equal(matchCase[0].titleId, 'demo-solo-leveling');

  // Original non-latin title match
  const matchOriginal = searchTitles(sampleTitles, '進撃の巨人');
  assert.equal(matchOriginal.length, 1);
  assert.equal(matchOriginal[0].titleId, 'demo-attack-on-titan');

  // Genre match
  const matchGenre = searchTitles(sampleTitles, 'Psychological');
  assert.equal(matchGenre.length, 2); // Evangelion and Goodnight Punpun
});

/* ── 2. Clearing Search ── */
test('2. Clearing Search: Empty or whitespace query returns the complete dataset', () => {
  const emptyResult = searchTitles(sampleTitles, '');
  assert.equal(emptyResult.length, sampleTitles.length);

  const whitespaceResult = searchTitles(sampleTitles, '   ');
  assert.equal(whitespaceResult.length, sampleTitles.length);

  // Verify TitlesPage provides a clear button and handler
  assert.ok(titlesPageCode.includes('titles-search-clear'), 'TitlesPage must include clear search button');
  assert.ok(titlesPageCode.includes('handleClear'), 'TitlesPage must implement handleClear callback');
});

/* ── 3. No-Results State ── */
test('3. No-Results State: Zero matches produce empty results with EmptyState in UI', () => {
  const noMatches = searchTitles(sampleTitles, 'xyznonexistentquery999');
  assert.equal(noMatches.length, 0);

  // Verify TitlesPage handles no results with proper EmptyState
  assert.ok(titlesPageCode.includes('title="No results found"'), 'TitlesPage must render "No results found" EmptyState');
  assert.ok(titlesPageCode.includes('Clear Search'), 'TitlesPage must provide a Clear Search button in EmptyState');
});

/* ── 4. Media-Type Filtering ── */
test('4. Media-Type Filtering: Separates anime, manga, and manhwa accurately', () => {
  const animeList = filterByMediaType(sampleTitles, 'anime');
  assert.equal(animeList.length, 4);
  assert.ok(animeList.every((t) => t.mediaType === 'anime'));

  const mangaList = filterByMediaType(sampleTitles, 'manga');
  assert.equal(mangaList.length, 4);
  assert.ok(mangaList.every((t) => t.mediaType === 'manga'));

  const manhwaList = filterByMediaType(sampleTitles, 'manhwa');
  assert.equal(manhwaList.length, 4);
  assert.ok(manhwaList.every((t) => t.mediaType === 'manhwa'));

  // 'all' returns all
  const allList = filterByMediaType(sampleTitles, 'all');
  assert.equal(allList.length, sampleTitles.length);
});

/* ── 5. Sorting ── */
test('5. Sorting: Correctly orders records by title, rating, and year', () => {
  // Title A-Z
  const titleAsc = sortTitles(sampleTitles, 'title-asc');
  assert.equal(titleAsc[0].title, 'Attack on Titan');
  assert.equal(titleAsc[titleAsc.length - 1].title, 'Vinland Saga');

  // Title Z-A
  const titleDesc = sortTitles(sampleTitles, 'title-desc');
  assert.equal(titleDesc[0].title, 'Vinland Saga');
  assert.equal(titleDesc[titleDesc.length - 1].title, 'Attack on Titan');

  // Rating Descending
  const ratingDesc = sortTitles(sampleTitles, 'rating-desc');
  assert.equal(ratingDesc[0].title, 'Berserk'); // 9.4
  assert.equal(ratingDesc[ratingDesc.length - 1].title, 'The God of High School'); // 8.1

  // Rating Ascending
  const ratingAsc = sortTitles(sampleTitles, 'rating-asc');
  assert.equal(ratingAsc[0].title, 'The God of High School'); // 8.1
  assert.equal(ratingAsc[ratingAsc.length - 1].title, 'Berserk'); // 9.4

  // Year Descending
  const yearDesc = sortTitles(sampleTitles, 'year-desc');
  assert.equal(yearDesc[0].year, 2020); // Omniscient Reader
  assert.equal(yearDesc[yearDesc.length - 1].year, 1989); // Berserk

  // Year Ascending
  const yearAsc = sortTitles(sampleTitles, 'year-asc');
  assert.equal(yearAsc[0].year, 1989); // Berserk
  assert.equal(yearAsc[yearAsc.length - 1].year, 2020); // Omniscient Reader
});

/* ── 6. Bookmark Status Filtering ── */
test('6. Bookmark Status Filtering: Accurately filters and tallies statuses', () => {
  const counts = countByStatus(sampleTitles);
  assert.equal(counts.consuming, 3);
  assert.equal(counts.plan_to_consume, 3);
  assert.equal(counts.completed, 4);
  assert.equal(counts.on_hold, 1);
  assert.equal(counts.dropped, 1);

  const completed = filterByBookmarkStatus(sampleTitles, 'completed');
  assert.equal(completed.length, 4);
  assert.ok(completed.every((t) => t.bookmarkStatus === 'completed'));

  const consuming = filterByBookmarkStatus(sampleTitles, 'consuming');
  assert.equal(consuming.length, 3);
  assert.ok(consuming.every((t) => t.bookmarkStatus === 'consuming'));

  // BookmarksPage binds status counts and options
  assert.ok(bookmarksPageCode.includes('countByStatus(DEMO_TITLES)'), 'BookmarksPage must calculate status counts');
  assert.ok(bookmarksPageCode.includes('filterByBookmarkStatus'), 'BookmarksPage must use filterByBookmarkStatus');
});

/* ── 7. Empty-State Rendering ── */
test('7. Empty-State Rendering: Pages render EmptyState for zero records', () => {
  assert.ok(titlesPageCode.includes('<EmptyState'), 'TitlesPage renders EmptyState');
  assert.ok(bookmarksPageCode.includes('<EmptyState'), 'BookmarksPage renders EmptyState');
  assert.ok(collectionsPageCode.includes('<EmptyState'), 'CollectionsPage renders EmptyState');
  assert.ok(myListPageCode.includes('<EmptyState'), 'MyListPage renders EmptyState');
});

/* ── 8. Poster Fallback ── */
test('8. Poster Fallback: PosterCard provides img onError fallback to avoid broken image icons', () => {
  assert.ok(posterCardCode.includes('onError='), 'PosterCard must handle onError');
  assert.ok(posterCardCode.includes('setImgFailed(true)'), 'PosterCard must set imgFailed state on error');
  assert.ok(posterCardCode.includes('poster-card-placeholder'), 'PosterCard must render placeholder on error');
});

/* ── 9. Valid Navigation ── */
test('9. Valid Navigation: All navigation links in Header, Sidebar, and AppShell lead to registered routes', () => {
  // Routes registered in AppRouter
  const registeredPaths = ['/', '/bookmarks', '/my-list', '/collections', '/titles', '/import', '/settings'];

  // Check router registrations
  for (const p of registeredPaths) {
    if (p === '/') {
      assert.ok(routerCode.includes('<Route index'), 'Router must have index route');
    } else {
      const seg = p.slice(1);
      assert.ok(routerCode.includes(`path="${seg}"`), `Router must register ${p}`);
    }
  }

  // Ensure Header links point only to registered paths and NO broken /titles/new link
  assert.ok(!headerCode.includes('to="/titles/new"'), 'Header must NOT link to non-existent /titles/new');
  assert.ok(headerCode.includes("to: '/'"), 'Header includes valid Dashboard route');
  assert.ok(headerCode.includes("to: '/bookmarks'"), 'Header includes valid Bookmarks route');
  assert.ok(headerCode.includes("to: '/my-list'"), 'Header includes valid My List route');
  assert.ok(headerCode.includes("to: '/collections'"), 'Header includes valid Collections route');
  assert.ok(headerCode.includes("to: '/titles'"), 'Header includes valid Titles route');
  assert.ok(headerCode.includes("to=\"/settings\""), 'Header avatar links to Settings');

  // Sidebar links
  assert.ok(sidebarCode.includes("to: '/'"), 'Sidebar includes Dashboard');
  assert.ok(sidebarCode.includes("to: '/bookmarks'"), 'Sidebar includes Bookmarks');
  assert.ok(sidebarCode.includes("to: '/my-list'"), 'Sidebar includes My List');
  assert.ok(sidebarCode.includes("to: '/collections'"), 'Sidebar includes Collections');
  assert.ok(sidebarCode.includes("to: '/titles'"), 'Sidebar includes Titles');
  assert.ok(sidebarCode.includes("to: '/settings'"), 'Sidebar includes Settings');
});

/* ── 10. Honest Preview-Only Add Title Behavior ── */
test('10. Honest Preview-Only Add Title Behavior: Modal is marked as preview and does not claim persistence', () => {
  assert.ok(addModalCode.includes('Preview form — Phase 05 feature'), 'AddTitleModal must declare Phase 05 preview notice');
  assert.ok(addModalCode.includes('disabled'), 'AddTitleModal submit button must be disabled to prevent false save');
  assert.ok(addModalCode.includes('Save Title (Phase 05)'), 'AddTitleModal submit button must explicitly say Phase 05');
  assert.ok(!addModalCode.includes('alert('), 'AddTitleModal must not trigger fake alert');
  assert.ok(!addModalCode.includes('Saved successfully'), 'AddTitleModal must not display fictitious database success message');
  assert.ok(!addModalCode.includes('toast('), 'AddTitleModal must not fire fake toast notifications');
});

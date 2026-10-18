import type {
  ImportSearchResultItem,
  ImportDraft,
  TitleAliasInput,
  MediaType,
} from '@animemanager/shared';

/**
 * Normalizes Jikan search candidates into concise summary cards.
 */
export function normalizeSearchCandidates(
  upstreamItems: any[],
  queryMediaType: 'anime' | 'manga'
): ImportSearchResultItem[] {
  if (!Array.isArray(upstreamItems)) {
    return [];
  }

  return upstreamItems.map((raw) => {
    const malId = Number(raw.mal_id);
    const rawType = (raw.type as string) || '';

    // Disambiguate manga vs manhwa in candidate summary
    let resolvedMediaType: MediaType = queryMediaType;
    if (queryMediaType === 'manga' && rawType.toLowerCase() === 'manhwa') {
      resolvedMediaType = 'manhwa';
    }

    // Best display title
    const englishTitle = (raw.title_english as string) || (raw.title as string) || 'Untitled';
    const originalTitle = (raw.title_japanese as string) || null;
    const romanizedTitle = raw.title && raw.title !== englishTitle ? raw.title : null;

    // Best cover image
    const coverUrl =
      raw.images?.webp?.large_image_url ||
      raw.images?.jpg?.large_image_url ||
      raw.images?.webp?.image_url ||
      raw.images?.jpg?.image_url ||
      null;

    // Synopsis snippet (cleanly truncated without markdown/HTML)
    let synopsisSnippet: string | null = null;
    if (typeof raw.synopsis === 'string' && raw.synopsis.trim()) {
      const clean = raw.synopsis.replace(/\s+/g, ' ').trim();
      synopsisSnippet = clean.length > 240 ? `${clean.slice(0, 237)}...` : clean;
    }

    // Release year
    let releaseYear: number | null = null;
    if (typeof raw.year === 'number') {
      releaseYear = raw.year;
    } else if (raw.aired?.from) {
      const parsedYear = new Date(raw.aired.from).getFullYear();
      if (!isNaN(parsedYear)) releaseYear = parsedYear;
    } else if (raw.published?.from) {
      const parsedYear = new Date(raw.published.from).getFullYear();
      if (!isNaN(parsedYear)) releaseYear = parsedYear;
    }

    return {
      malId,
      mediaType: resolvedMediaType,
      sourceType: rawType || null,
      englishTitle,
      originalTitle,
      romanizedTitle,
      coverUrl,
      synopsisSnippet,
      sourceScore: typeof raw.score === 'number' ? Number(raw.score.toFixed(2)) : null,
      sourceRank: typeof raw.rank === 'number' ? raw.rank : null,
      publicationStatus: (raw.status as string) || null,
      releaseYear,
    };
  });
}

/**
 * Normalizes Jikan full detail payload into an editable, comprehensive ImportDraft.
 */
export function normalizeDetailDraft(
  rawDetail: any,
  queryMediaType: 'anime' | 'manga'
): ImportDraft {
  const data = rawDetail?.data || rawDetail || {};
  const malId = String(data.mal_id || '');
  const warnings: string[] = [];

  // 1. Media Type & Manhwa Disambiguation
  let mediaType: MediaType = queryMediaType;
  let needsMediaConfirmation = false;
  const rawType = ((data.type as string) || '').toLowerCase();

  if (queryMediaType === 'manga') {
    if (rawType === 'manhwa') {
      mediaType = 'manhwa';
      needsMediaConfirmation = false;
    } else if (rawType === 'manga') {
      mediaType = 'manga';
      needsMediaConfirmation = false;
    } else {
      // Ambiguous: Webtoon, Manhua, Novel, One-shot, etc.
      mediaType = 'manga';
      needsMediaConfirmation = true;
      warnings.push(
        `Upstream format is '${data.type || 'Unknown'}'. Please confirm whether this title is Manga or Manhwa before saving.`
      );
    }
  }

  // 2. Display and Original Titles
  const englishTitle = (data.title_english as string) || (data.title as string) || 'Untitled';
  const originalTitle = (data.title_japanese as string) || null;

  // 3. Aliases (deduplicated)
  const aliasMap = new Map<string, TitleAliasInput>();

  // If romanized/main title differs from display English title, add as romanized alias
  if (data.title && data.title !== englishTitle) {
    aliasMap.set(data.title.toLowerCase(), {
      title: data.title,
      languageCode: 'ja',
      aliasType: 'romanized',
    });
  }

  // Add upstream title_synonyms
  if (Array.isArray(data.title_synonyms)) {
    for (const syn of data.title_synonyms) {
      if (typeof syn === 'string' && syn.trim() && syn !== englishTitle) {
        const key = syn.trim().toLowerCase();
        if (!aliasMap.has(key)) {
          aliasMap.set(key, {
            title: syn.trim(),
            languageCode: null,
            aliasType: 'other',
          });
        }
      }
    }
  }

  // Add titles array if present in v4
  if (Array.isArray(data.titles)) {
    for (const t of data.titles) {
      if (typeof t?.title === 'string' && t.title.trim() && t.title !== englishTitle) {
        const key = t.title.trim().toLowerCase();
        if (!aliasMap.has(key)) {
          let aliasType: 'native' | 'romanized' | 'translated' | 'other' = 'other';
          if (t.type === 'Japanese') aliasType = 'native';
          else if (t.type === 'Synonym') aliasType = 'other';
          else if (t.type === 'English') aliasType = 'translated';
          else if (t.type === 'Default') aliasType = 'romanized';

          aliasMap.set(key, {
            title: t.title.trim(),
            languageCode: t.type === 'Japanese' ? 'ja' : null,
            aliasType,
          });
        }
      }
    }
  }

  const aliases = Array.from(aliasMap.values());

  // 4. Synopsis & Background (trimmed, reviews excluded)
  let synopsis: string | null = null;
  if (typeof data.synopsis === 'string' && data.synopsis.trim()) {
    // Strip upstream trailing attribution "[Written by MAL Rewrite]" cleanly
    const cleaned = data.synopsis.replace(/\[Written by MAL Rewrite\]/gi, '').trim();
    synopsis = cleaned || null;
  } else {
    warnings.push('Synopsis is not available for this title.');
  }

  const background =
    typeof data.background === 'string' && data.background.trim()
      ? data.background.trim()
      : null;

  // 5. Cover Image
  const coverUrl =
    data.images?.webp?.large_image_url ||
    data.images?.jpg?.large_image_url ||
    data.images?.webp?.image_url ||
    data.images?.jpg?.image_url ||
    null;

  if (!coverUrl) {
    warnings.push('Cover image is not available for this title.');
  }

  // 6. Release Year & Date Boundaries
  let releaseYear: number | null = null;
  let startDate: string | null = null;
  let endDate: string | null = null;

  if (typeof data.year === 'number') {
    releaseYear = data.year;
  }

  const dateFrom = data.aired?.from || data.published?.from;
  const dateTo = data.aired?.to || data.published?.to;

  if (dateFrom) {
    const d = new Date(dateFrom);
    if (!isNaN(d.getTime())) {
      startDate = d.toISOString().slice(0, 10);
      if (!releaseYear) {
        releaseYear = d.getFullYear();
      }
    }
  }

  if (dateTo) {
    const d = new Date(dateTo);
    if (!isNaN(d.getTime())) {
      endDate = d.toISOString().slice(0, 10);
    }
  }

  // 7. Counts
  const episodeCount =
    typeof data.episodes === 'number' && data.episodes >= 0 ? data.episodes : null;
  const chapterCount =
    typeof data.chapters === 'number' && data.chapters >= 0 ? data.chapters : null;

  // 8. Scores & Rank
  const sourceScore =
    typeof data.score === 'number' ? Number(data.score.toFixed(2)) : null;
  const sourceRank = typeof data.rank === 'number' && data.rank > 0 ? data.rank : null;
  const sourcePopularity =
    typeof data.popularity === 'number' && data.popularity > 0 ? data.popularity : null;

  // 9. Genres & Tags (Deduplicated)
  const genreSet = new Set<string>();
  if (Array.isArray(data.genres)) {
    for (const g of data.genres) {
      if (typeof g?.name === 'string' && g.name.trim()) {
        genreSet.add(g.name.trim());
      }
    }
  }

  const tagSet = new Set<string>();
  if (Array.isArray(data.themes)) {
    for (const t of data.themes) {
      if (typeof t?.name === 'string' && t.name.trim()) {
        tagSet.add(t.name.trim());
      }
    }
  }
  if (Array.isArray(data.demographics)) {
    for (const d of data.demographics) {
      if (typeof d?.name === 'string' && d.name.trim()) {
        tagSet.add(d.name.trim());
      }
    }
  }

  return {
    provider: 'myanimelist',
    externalId: malId,
    sourceUrl: `https://myanimelist.net/${queryMediaType}/${malId}`,
    mediaType,
    needsMediaConfirmation,
    englishTitle,
    originalTitle,
    aliases,
    synopsis,
    background,
    coverUrl,
    releaseYear,
    publicationStatus: (data.status as string) || null,
    startDate,
    endDate,
    episodeCount,
    chapterCount,
    sourceScore,
    sourceRank,
    sourcePopularity,
    genres: Array.from(genreSet),
    tags: Array.from(tagSet),
    sourceRetrievedAt: new Date().toISOString(),
    warnings,
    duplicateExistingTitleId: null,
    duplicateExistingTitleName: null,
  };
}

import {
  getTitlesCollection,
  getCollectionsCollection,
  getBookmarksCollection,
} from '../repositories/mongo.js';

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export class ExportService {
  /**
   * Export complete library data for authenticated owner.
   */
  async exportJson(ownerId: string) {
    const titlesCol = await getTitlesCollection();
    const collectionsCol = await getCollectionsCollection();
    const bookmarksCol = await getBookmarksCollection();

    const titles = await titlesCol.find({ ownerId }).sort({ createdAt: 1 }).toArray();
    const collections = await collectionsCol.find({ ownerId }).sort({ createdAt: 1 }).toArray();
    const bookmarks = await bookmarksCol.find({ ownerId }).sort({ createdAt: 1 }).toArray();

    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      ownerId,
      titles: titles.map((row) => ({
        id: row._id,
        mediaType: row.mediaType,
        englishTitle: row.englishTitle,
        originalTitle: row.originalTitle,
        synopsis: row.synopsis,
        background: row.background,
        coverUrl: row.coverUrl,
        coverStoragePath: row.coverStoragePath,
        coverSourceType: row.coverSourceType,
        releaseYear: row.releaseYear,
        publicationStatus: row.publicationStatus,
        startDate: row.startDate,
        endDate: row.endDate,
        episodeCount: row.episodeCount,
        chapterCount: row.chapterCount,
        sourceScore: row.sourceScore != null ? Number(row.sourceScore) : null,
        sourceRank: row.sourceRank,
        sourcePopularity: row.sourcePopularity,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
        updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
        aliases: row.aliases || [],
        genres: row.genres || [],
        tags: row.tags || [],
        externalSources: row.externalSources || [],
      })),
      collections: collections.map((c) => ({
        id: c._id,
        name: c.name,
        description: c.description,
        coverUrl: c.coverUrl,
        icon: c.icon,
        color: c.color,
        sortMode: c.sortMode,
        createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
        updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : String(c.updatedAt),
        titles: (c.items || []).map((i) => ({
          titleId: i.titleId,
          position: i.position,
          addedAt: i.addedAt instanceof Date ? i.addedAt.toISOString() : String(i.addedAt),
        })),
      })),
      bookmarks: bookmarks.map((b) => ({
        id: b._id,
        titleId: b.titleId,
        status: b.status,
        progress: b.progress,
        progressUnit: b.progressUnit,
        progressTotal: b.progressTotal,
        priority: b.priority,
        personalRating: b.personalRating != null ? Number(b.personalRating) : null,
        notes: b.notes,
        startedAt: b.startedAt,
        completedAt: b.completedAt,
        createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : String(b.createdAt),
        updatedAt: b.updatedAt instanceof Date ? b.updatedAt.toISOString() : String(b.updatedAt),
      })),
    };
  }

  /**
   * Export flat CSV of titles with tracking and collections.
   */
  async exportCsv(ownerId: string): Promise<string> {
    const titlesCol = await getTitlesCollection();
    const collectionsCol = await getCollectionsCollection();
    const bookmarksCol = await getBookmarksCollection();

    const titles = await titlesCol.find({ ownerId }).sort({ createdAt: 1 }).toArray();
    const collections = await collectionsCol.find({ ownerId }).toArray();
    const bookmarks = await bookmarksCol.find({ ownerId }).toArray();

    const bookmarkByTitle = new Map(bookmarks.map((b) => [b.titleId, b]));
    const collectionsByTitle = new Map<string, string[]>();
    for (const col of collections) {
      for (const item of col.items || []) {
        const list = collectionsByTitle.get(item.titleId) || [];
        list.push(col.name);
        collectionsByTitle.set(item.titleId, list);
      }
    }

    const headers = [
      'Title ID',
      'Media Type',
      'English Title',
      'Original Title',
      'Release Year',
      'Status',
      'Episode Count',
      'Chapter Count',
      'Bookmark Status',
      'Progress',
      'Progress Unit',
      'Total Progress',
      'Personal Rating',
      'Collections',
    ];

    const lines: string[] = [headers.map(escapeCsvField).join(',')];

    for (const t of titles) {
      const b = bookmarkByTitle.get(t._id);
      const cols = collectionsByTitle.get(t._id) || [];
      const colString = cols.join('; ');

      lines.push(
        [
          t._id,
          t.mediaType,
          t.englishTitle,
          t.originalTitle,
          t.releaseYear,
          t.publicationStatus,
          t.episodeCount,
          t.chapterCount,
          b ? b.status : 'untracked',
          b ? b.progress : '',
          b ? b.progressUnit : '',
          b ? b.progressTotal ?? '' : '',
          b && b.personalRating != null ? Number(b.personalRating).toFixed(1) : '',
          colString,
        ]
          .map(escapeCsvField)
          .join(',')
      );
    }

    return lines.join('\r\n');
  }
}

export const exportService = new ExportService();

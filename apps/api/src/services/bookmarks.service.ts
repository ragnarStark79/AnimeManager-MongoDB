import {
  bookmarksRepository,
  type BookmarkListItem,
  type BookmarkListFilters,
} from '../repositories/bookmarks.repository.js';
import type { BookmarkCreateInput, BookmarkUpdateInput } from '@animemanager/shared';
import { NotFoundError, BadRequestError } from '../errors/index.js';

export const bookmarksService = {
  async listBookmarks(ownerId: string, filters: BookmarkListFilters) {
    return bookmarksRepository.list(ownerId, filters);
  },

  async getBookmarkById(ownerId: string, id: string): Promise<BookmarkListItem> {
    const bookmark = await bookmarksRepository.findById(ownerId, id);
    if (!bookmark) {
      throw new NotFoundError('Bookmark not found');
    }
    return bookmark;
  },

  async createBookmark(ownerId: string, data: BookmarkCreateInput): Promise<BookmarkListItem> {
    if (data.progressTotal !== null && data.progressTotal !== undefined) {
      if (data.progress > data.progressTotal) {
        throw new BadRequestError(`Progress (${data.progress}) cannot exceed total count (${data.progressTotal})`);
      }
    }
    return bookmarksRepository.create(ownerId, data);
  },

  async updateBookmark(
    ownerId: string,
    id: string,
    data: BookmarkUpdateInput
  ): Promise<BookmarkListItem> {
    const existing = await bookmarksRepository.findById(ownerId, id);
    if (!existing) {
      throw new NotFoundError('Bookmark not found');
    }

    const effectiveProgress = data.progress !== undefined ? data.progress : existing.progress;
    const effectiveTotal = data.progressTotal !== undefined ? data.progressTotal : existing.progressTotal;

    if (effectiveTotal !== null && effectiveTotal !== undefined) {
      if (effectiveProgress > effectiveTotal) {
        throw new BadRequestError(`Progress (${effectiveProgress}) cannot exceed total count (${effectiveTotal})`);
      }
    }

    const updated = await bookmarksRepository.update(ownerId, id, data);
    if (!updated) {
      throw new NotFoundError('Bookmark not found');
    }
    return updated;
  },

  async deleteBookmark(ownerId: string, id: string): Promise<void> {
    const deleted = await bookmarksRepository.delete(ownerId, id);
    if (!deleted) {
      throw new NotFoundError('Bookmark not found');
    }
  },

  async upsertTitleBookmark(
    ownerId: string,
    titleId: string,
    data: Omit<BookmarkCreateInput, 'titleId'>
  ): Promise<BookmarkListItem> {
    if (data.progressTotal !== null && data.progressTotal !== undefined) {
      if (data.progress > data.progressTotal) {
        throw new BadRequestError(`Progress (${data.progress}) cannot exceed total count (${data.progressTotal})`);
      }
    }
    return bookmarksRepository.upsertByTitleId(ownerId, titleId, data);
  },
};

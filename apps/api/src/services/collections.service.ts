import {
  collectionsRepository,
  type CollectionSummary,
  type CollectionDetail,
} from '../repositories/collections.repository.js';
import type { CollectionCreateInput, CollectionUpdateInput } from '@animemanager/shared';
import { NotFoundError } from '../errors/index.js';

export const collectionsService = {
  async listCollections(ownerId: string): Promise<CollectionSummary[]> {
    return collectionsRepository.list(ownerId);
  },

  async getCollectionById(ownerId: string, id: string): Promise<CollectionDetail> {
    const col = await collectionsRepository.findById(ownerId, id);
    if (!col) {
      throw new NotFoundError('Collection not found');
    }
    return col;
  },

  async createCollection(ownerId: string, data: CollectionCreateInput): Promise<CollectionSummary> {
    return collectionsRepository.create(ownerId, data);
  },

  async updateCollection(
    ownerId: string,
    id: string,
    data: CollectionUpdateInput
  ): Promise<CollectionSummary> {
    const updated = await collectionsRepository.update(ownerId, id, data);
    if (!updated) {
      throw new NotFoundError('Collection not found');
    }
    return updated;
  },

  async deleteCollection(ownerId: string, id: string): Promise<void> {
    const deleted = await collectionsRepository.delete(ownerId, id);
    if (!deleted) {
      throw new NotFoundError('Collection not found');
    }
  },

  async addTitles(ownerId: string, collectionId: string, titleIds: string[]): Promise<void> {
    await collectionsRepository.addTitles(ownerId, collectionId, titleIds);
  },

  async removeTitle(ownerId: string, collectionId: string, titleId: string): Promise<void> {
    const removed = await collectionsRepository.removeTitle(ownerId, collectionId, titleId);
    if (!removed) {
      throw new NotFoundError('Title membership not found in this collection');
    }
  },

  async reorderTitles(
    ownerId: string,
    collectionId: string,
    order: Array<{ titleId: string; position: number }>
  ): Promise<void> {
    await collectionsRepository.reorderTitles(ownerId, collectionId, order);
  },
};
